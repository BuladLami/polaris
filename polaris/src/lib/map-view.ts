/**
 * Camera framing for the map. Pure geometry on the container size, so the view
 * rules can be read in one place.
 */

export interface MapPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const EDGE_PX = 40;
/** Expanded map key (24rem) plus its inset and a small gap. */
const MAP_KEY_CLEARANCE_PX = 416;
/** Below this usable width, clearing the key would leave too little map. */
const MIN_USABLE_WIDTH_PX = 320;

/** The map key starts collapsed at laptop widths and below. */
export const MAP_KEY_COLLAPSE_WIDTH_PX = 1440;

export const mapKeyStartsOpen = () =>
  window.innerWidth > MAP_KEY_COLLAPSE_WIDTH_PX;

const clearOfKey = (mapWidth: number): MapPadding => ({
  top: EDGE_PX,
  right: EDGE_PX,
  bottom: EDGE_PX,
  left:
    mapWidth - MAP_KEY_CLEARANCE_PX - EDGE_PX >= MIN_USABLE_WIDTH_PX
      ? MAP_KEY_CLEARANCE_PX
      : EDGE_PX,
});

/** Padding for the whole-district view, clear of the key when it starts open. */
export function districtPadding(mapWidth: number): MapPadding {
  return mapKeyStartsOpen()
    ? clearOfKey(mapWidth)
    : { top: EDGE_PX, right: EDGE_PX, bottom: EDGE_PX, left: EDGE_PX };
}
