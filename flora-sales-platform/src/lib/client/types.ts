export interface EnquiryRow {
  id: string;
  enquiryRef: string;
  propertyId: string;
  propertyName: string;
  propertyCode: string;
  ownerId: string;
  ownerName: string;
  createdById: string;
  source: string;
  enquiryType: string;
  priority: string;
  companyName: string;
  contactPerson: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  accountType: string;
  clientRemarks: string | null;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  rooms: number;
  roomCategory: string | null;
  guests: number | null;
  mealPlan: string | null;
  additionalRequirements: string | null;
  stayType: string;
  requestedRate: number | null;
  proposedRate: number | null;
  revisedRate: number | null;
  approvedRate: number | null;
  rateBasis: string;
  taxInclusion: string;
  rateVariance: number | null;
  discountBps: number | null;
  totalRoomNights: number;
  potentialRevenue: number;
  expectedBookingValue: number;
  probability: number;
  nightlyEquivalentRate: number | null;
  status: string;
  confirmedAt: string | null;
  closedAt: string | null;
  lostReason: string | null;
  lastFollowUpAt: string | null;
  nextFollowUpAt: string | null;
  followUpMethod: string | null;
  latestClientResponse: string | null;
  nextAction: string | null;
  salesNotes: string | null;
  delayReason: string | null;
  lastActivityAt: string;
  version: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Meta {
  properties: { id: string; code: string; name: string; shortName: string }[];
  users: { id: string; name: string; role: string; managerId: string | null }[];
  settings: { longStayThresholdNights: number; approvalDiscountThresholdPct: number; highValueThresholdAed: number };
  enums: Record<string, readonly string[]>;
}

export interface ActivityRow {
  id: string;
  type: string;
  userName: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  clientFeedback: string | null;
  nextAction: string | null;
  followUpMethod: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface RateRevisionRow { id: string; field: string; previousValue: number | null; newValue: number | null; rateBasis: string; reason: string | null; userName: string; createdAt: string }
export interface ApprovalRow { id: string; enquiryId: string; requestedRate: number; rateBasis: string; referenceRate: number | null; discountBps: number; reason: string | null; status: string; requestedByName: string; decidedById: string | null; decidedAt: string | null; decisionNote: string | null; createdAt: string; canDecide?: boolean }
export interface AttachmentRow { id: string; fileName: string; mimeType: string; sizeBytes: number; kind: string; createdAt: string; uploadedByName: string }

export interface EnquiryDetail {
  enquiry: EnquiryRow;
  activities: ActivityRow[];
  rateRevisions: RateRevisionRow[];
  approvals: ApprovalRow[];
  attachments: AttachmentRow[];
  permissions: { canEdit: boolean; canReassign: boolean; canDelete: boolean; canDecideApprovals: boolean };
}

export interface SlimEnquiry {
  id: string; enquiryRef: string; companyName: string; contactPerson: string; propertyName: string; propertyCode: string; ownerName: string; ownerId: string; status: string; priority: string;
  arrivalDate: string; departureDate: string; rooms: number; nights: number; rateBasis: string; requestedRate: number | null; proposedRate: number | null; revisedRate: number | null; approvedRate: number | null;
  rateVariance: number | null; discountBps: number | null; nightlyEquivalentRate: number | null; potentialRevenue: number; expectedBookingValue: number; probability: number;
  nextFollowUpAt: string | null; lastFollowUpAt: string | null; lastActivityAt: string; createdAt: string; isDemo: boolean; nextAction: string | null; latestClientResponse: string | null;
}
