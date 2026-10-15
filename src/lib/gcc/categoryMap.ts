import type { ReportCategory, ReportSubtype } from '@/lib/report/validation';

// GCC complaint types, from GET gccservices.in/pgr/api/getComplaintCategories (read
// 2026-10-15). The register API takes the sub-type id as ComplaintType and its name as
// ComplaintTitle.
export interface GccComplaintType {
  groupId: string;
  groupName: string;
  id: string;
  name: string;
}

const ROAD = { groupId: '18', groupName: 'Road and Footpath' };
const WATER = { groupId: '20', groupName: 'Water Stagnation' };
const GARBAGE = { groupId: '17', groupName: 'Garbage' };

const POTHOLE: GccComplaintType = { ...ROAD, id: '112', name: 'Pot hole fill up / Repairs to the damaged surface' };
const WATER_STAGNATION: GccComplaintType = { ...WATER, id: '138', name: 'Stagnation of Water' };

const OTHER_SUBTYPES: Record<ReportSubtype, GccComplaintType> = {
  open_manhole: { ...WATER, id: '143', name: 'Covering  Manholes of Storm Water Drain' },
  damaged_footpath: { ...ROAD, id: '115', name: 'Repairs to existing Footpath' },
  dug_up_road: { ...ROAD, id: '113', name: 'Relaying of Road' },
  debris: { ...GARBAGE, id: '99', name: 'Removal of Debris' },
  // GCC has no closer type for these; the complaint text names the actual issue.
  speed_breaker: POTHOLE,
  signage: POTHOLE,
  other: POTHOLE,
};

export function gccComplaintTypeFor(category: ReportCategory, subtype: ReportSubtype | null): GccComplaintType {
  if (category === 'pothole') return POTHOLE;
  if (category === 'waterlogging') return WATER_STAGNATION;
  return OTHER_SUBTYPES[subtype ?? 'other'];
}
