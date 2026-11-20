import React from "react";

import type { SkImage } from "../../../skia/types";
import { AlphaType, ColorType } from "../../../skia/types";
import {
  Circle,
  DashPathEffect,
  Group,
  Path,
  RoundedRect,
} from "../../components";
import { PIXEL_RATIO, surface } from "../setup";

// The icons of the spec, laid out on a 256x256 offscreen sheet of 64x64
// cells, drawn once by the regular renderer.
//
//   centered circle | inside circle | inside rrect | arrow (inside)
//   dashed circle   | inside arc    | scaled 2x icon (inside, 2 cells)
//   outside circle  |               |
const Sheet = () => (
  <>
    {/* (0,0): the centered default, unchanged since it shipped */}
    <Group style="stroke" strokeWidth={8}>
      <Circle cx={32} cy={32} r={24} />
    </Group>
    {/* (1,0): stroke aligned inside, width from the paint */}
    <Group style="stroke" strokeWidth={8} strokeAlign="inside">
      <Circle cx={96} cy={32} r={24} />
    </Group>
    {/* (2,0): rounded rectangle aligned inside, outer corners keep r=8 */}
    <Group style="stroke" strokeWidth={8} strokeAlign="inside">
      <RoundedRect x={136} y={8} width={48} height={48} r={8} />
    </Group>
    {/* (3,0): arrow, a polyline with its own strokeWidth, miter join and
        round caps, aligned inside by the paint */}
    <Group style="stroke" strokeAlign="inside">
      <Path
        path="M208 32 L224 16 L240 32"
        strokeWidth={8}
        strokeJoin="miter"
        strokeCap="round"
      />
    </Group>
    {/* (0,1): dashed circle aligned inside, dashes measured on the circle */}
    <Group style="stroke" strokeWidth={8} strokeAlign="inside">
      <Circle cx={32} cy={96} r={24}>
        <DashPathEffect intervals={[12, 8]} phase={0} />
      </Circle>
    </Group>
    {/* (1,1): three quarters of a circle, from 3 o'clock clockwise to 12
        o'clock, aligned inside, round caps on the open ends */}
    <Group style="stroke" strokeAlign="inside">
      <Path
        path="M120 96 A24 24 0 1 1 96 72"
        strokeWidth={8}
        strokeCap="round"
      />
    </Group>
    {/* (2,1)-(3,2): the inside circle scaled by 2, stroke width 16 */}
    <Group transform={[{ translateX: 128 }, { translateY: 64 }, { scale: 2 }]}>
      <Group style="stroke" strokeWidth={8} strokeAlign="inside">
        <Circle cx={32} cy={32} r={24} />
      </Group>
    </Group>
    {/* (0,2): stroke aligned outside */}
    <Group style="stroke" strokeWidth={8} strokeAlign="outside">
      <Circle cx={32} cy={160} r={24} />
    </Group>
  </>
);

// Solid ink at a logical point of the sheet; anti-aliased fringes are not
// looked at.
const inkAt = async (image: SkImage, x: number, y: number) => {
  const pixel = await image.readPixels(x * PIXEL_RATIO, y * PIXEL_RATIO, {
    width: 1,
    height: 1,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (pixel === null) {
    throw new Error("Unable to read the pixel back");
  }
  return pixel[3] > 128;
};

describe("Stroke alignment", () => {
  let sheet: SkImage;
  beforeAll(async () => {
    sheet = await surface.draw(<Sheet />);
  });

  it("keeps the centered stroke as the default", async () => {
    // Outer edge at radius 28, inner edge at radius 20.
    expect(await inkAt(sheet, 58, 32)).toBe(true);
    expect(await inkAt(sheet, 50, 32)).toBe(false);
  });

  it("aligns the circle stroke inside", async () => {
    // Outer edge on the circle (radius 24), inner edge at radius 16.
    expect(await inkAt(sheet, 122, 32)).toBe(false);
    expect(await inkAt(sheet, 114, 32)).toBe(true);
  });

  it("aligns the rounded rect stroke inside", async () => {
    expect(await inkAt(sheet, 160, 6)).toBe(false);
    expect(await inkAt(sheet, 160, 14)).toBe(true);
  });

  it("keeps the arrow's ink inside the polyline, caps excepted", async () => {
    // Inside the corner, below the tip.
    expect(await inkAt(sheet, 224, 20)).toBe(true);
    // The band hugs the outline on the inside.
    expect(await inkAt(sheet, 218, 26)).toBe(true);
    // The miter does not grow past the polyline.
    expect(await inkAt(sheet, 224, 14)).toBe(false);
    // Outside the polyline there is no ink (a centered stroke would cover
    // this point)...
    expect(await inkAt(sheet, 216, 22)).toBe(false);
    // ...except the round caps at the two ends.
    expect(await inkAt(sheet, 206, 34)).toBe(true);
  });

  it("keeps the dash pitch on the original circle", async () => {
    // Measured along the original circle from 3 o'clock, clockwise:
    // 12 on, 8 off, phase 0, read in the middle of the aligned band.
    expect(await inkAt(sheet, 52, 96)).toBe(true); // arc 0
    expect(await inkAt(sheet, 51, 101)).toBe(true); // arc ~6
    expect(await inkAt(sheet, 48, 108)).toBe(false); // arc ~15
    expect(await inkAt(sheet, 41, 114)).toBe(true); // arc ~27
    expect(await inkAt(sheet, 33, 116)).toBe(false); // arc ~37
    // ...and the band itself is aligned inside.
    expect(await inkAt(sheet, 58, 96)).toBe(false);
    expect(await inkAt(sheet, 50, 96)).toBe(true);
  });

  it("aligns the arc inside and keeps its round caps", async () => {
    // On the arc, the band is inside the circle.
    expect(await inkAt(sheet, 96, 118)).toBe(true);
    expect(await inkAt(sheet, 96, 122)).toBe(false);
    // The open ends keep their round caps.
    expect(await inkAt(sheet, 123, 96)).toBe(true);
    expect(await inkAt(sheet, 96, 69)).toBe(true);
    // The cut quarter does not come back.
    expect(await inkAt(sheet, 110, 82)).toBe(false);
  });

  it("aligns the scaled stroke on the scaled circle", async () => {
    // Scaled by 2: radius 48, stroke width 16, band from 32 to 48.
    expect(await inkAt(sheet, 232, 128)).toBe(true);
    expect(await inkAt(sheet, 244, 128)).toBe(false);
    expect(await inkAt(sheet, 216, 128)).toBe(false);
  });

  it("aligns the circle stroke outside", async () => {
    // No ink inside the outline; the stroke grows 8 out of it.
    expect(await inkAt(sheet, 62, 160)).toBe(true);
    expect(await inkAt(sheet, 54, 160)).toBe(false);
    expect(await inkAt(sheet, 66, 160)).toBe(false);
  });
});
