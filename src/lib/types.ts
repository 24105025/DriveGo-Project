export type Role = "ORGANIZER" | "ADMIN" | "VOLUNTEER";
export type Status = "DRAFT" | "ACTIVE" | "FUNDED" | "EXPIRED" | "REJECTED" | "ARCHIVED";
export type Category =
  | "HEALTHCARE"
  | "DISASTERS"
  | "FOOD"
  | "CLOTHING"
  | "EDUCATION"
  | "TOYS"
  | "FURNITURE"
  | "HYGIENE"
  | "MONETARY"
  | "MISCELLANEOUS";
export type VoteType = "TRUE_INFO" | "FALSE_INFO";

export const Status = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  FUNDED: "FUNDED",
  EXPIRED: "EXPIRED",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
} as const satisfies Record<string, Status>;

export const Category = {
  HEALTHCARE: "HEALTHCARE",
  DISASTERS: "DISASTERS",
  FOOD: "FOOD",
  CLOTHING: "CLOTHING",
  EDUCATION: "EDUCATION",
  TOYS: "TOYS",
  FURNITURE: "FURNITURE",
  HYGIENE: "HYGIENE",
  MONETARY: "MONETARY",
  MISCELLANEOUS: "MISCELLANEOUS",
} as const satisfies Record<string, Category>;

export const Role = {
  ORGANIZER: "ORGANIZER",
  ADMIN: "ADMIN",
  VOLUNTEER: "VOLUNTEER",
} as const satisfies Record<string, Role>;
