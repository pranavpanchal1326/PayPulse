/**
 * THE SIGNATURE SYSTEMS · blueprint §10
 *
 * Four things people remember, built before any screen consumes them, so that
 * every screen from P5 onward reaches for the same four rather than inventing
 * a fifth.
 */
export { Line, captionFor } from "./Line";
export type { LineProps, LineModel, LineBand, LineTick, LineBoundary, TickKind } from "./Line";

export { buildLineModel } from "./Line.model";
export type { LineSources } from "./Line.model";

export { useScrub } from "./Line.scrub";
export type { Scrub, ScrubOptions } from "./Line.scrub";

export { Segment, Ratio } from "./Segment";
export type { SegmentProps, RatioProps } from "./Segment";

export { Stack } from "./Stack.svg";
export type { StackProps, StackBlock } from "./Stack.svg";

export { RollingNumber, RollingCount } from "./RollingNumber";
export type { RollingNumberProps, NumberScale } from "./RollingNumber";

export { ProvenanceDrawer } from "./ProvenanceDrawer";
export type { ProvenanceDrawerProps } from "./ProvenanceDrawer";

export { buildPayslipProvenance } from "./provenance";
export type { ProvenanceNode, ProvenanceSource, PayslipProvenanceSources } from "./provenance";

export { PayslipCard } from "./PayslipCard";
export type { PayslipCardProps } from "./PayslipCard";
