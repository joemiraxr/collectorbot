import * as s from '@zerobias-org/schema-sdi-petstore-example-ts/dist/src/index.js';
import * as m from '@zerobias-org/module-sdi-petstore-example';

// Pitfall 6: ALL_CAPS schema-side enum normalization. The schema-sdi-petstore-example
// package's enums (pet.status: AVAILABLE | PENDING | SOLD; order.status: PLACED |
// APPROVED | DELIVERED) are encoded in YAML but the schema-ts package emits the
// `status` field as plain `string` (no PetStatusEnum / OrderStatusEnum exports —
// confirmed in node_modules/@zerobias-org/schema-sdi-petstore-example-ts/dist/src/
// class/SdiPetstorePet.d.ts and SdiPetstoreOrder.d.ts).
//
// Therefore: helpers return ALL_CAPS string literals directly. Module DTOs use
// EnumValue singletons (m.Pet.StatusEnum.Available, etc.); switch on those.

function toPetStatus(raw?: m.Pet.StatusEnumDef): string | undefined {
  switch (raw) {
    case m.Pet.StatusEnum.Available: return 'AVAILABLE';
    case m.Pet.StatusEnum.Pending:   return 'PENDING';
    case m.Pet.StatusEnum.Sold:      return 'SOLD';
    default: return undefined;
  }
}

function toOrderStatus(raw?: m.Order.StatusEnumDef): string | undefined {
  switch (raw) {
    case m.Order.StatusEnum.Placed:    return 'PLACED';
    case m.Order.StatusEnum.Approved:  return 'APPROVED';
    case m.Order.StatusEnum.Delivered: return 'DELIVERED';
    default: return undefined;
  }
}

export function mapPet(raw: m.Pet): s.SdiPetstorePet {
  // int64 -> string coercion via template literal (avigilon Pitfall 6 pattern).
  const id = `${raw.id ?? ''}`;
  const output: s.SdiPetstorePet = {
    id,
    name: raw.name || `Pet ${id}`,
    status: toPetStatus(raw.status),
    categoryId: raw.category?.id ? `${raw.category.id}` : undefined,
    // tagIds is declared as `string` (not array) on SdiPetstorePet — collapse to
    // a comma-separated list when there are multiple tags, undefined when none.
    tagIds: raw.tags && raw.tags.length > 0
      ? raw.tags.map((t) => `${t.id ?? ''}`).filter(Boolean).join(',') || undefined
      : undefined,
    // photoUrls maps onto schema-side `images` (declared as `string` — same single-
    // valued shape as tagIds).
    images: raw.photoUrls && raw.photoUrls.length > 0
      ? raw.photoUrls.join(',')
      : undefined,
  };
  return output;
}

export function mapCategory(raw: m.Category): s.SdiPetstoreCategory {
  const id = `${raw.id ?? ''}`;
  const output: s.SdiPetstoreCategory = {
    id,
    name: raw.name || `Category ${id}`,
  };
  return output;
}

export function mapTag(raw: m.Tag): s.SdiPetstoreTag {
  const id = `${raw.id ?? ''}`;
  const output: s.SdiPetstoreTag = {
    id,
    name: raw.name || `Tag ${id}`,
  };
  return output;
}

// schema field order.shipDateAt is declared `type: date` — the dataloader
// expects YYYY-MM-DD while the TS class types the field as Date. The
// Object.assign workaround satisfies both the type checker (Date) and the
// runtime validator (date-only string). Canonical pattern from
// .claude/ADVANCED_MAPPING_GUIDE.md.
function toDate(date?: Date): any {
  if (!date) return undefined;
  const dateOnly = date.toISOString().split('T')[0];
  return Object.assign(new Date(dateOnly), dateOnly);
}

export function mapOrder(raw: m.Order): s.SdiPetstoreOrder {
  const id = `${raw.id ?? ''}`;
  const output: s.SdiPetstoreOrder = {
    id,
    name: `Order ${id}`,
    petId: raw.petId !== undefined ? `${raw.petId}` : undefined,
    quantity: raw.quantity,
    status: toOrderStatus(raw.status),
    fulfilled: raw.complete,
    shipDateAt: toDate(raw.shipDate),
  };
  return output;
}

export function mapPetstoreUser(raw: m.PetstoreUser): s.SdiPetstoreUser {
  const id = `${raw.id ?? ''}`;
  const fullName = [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim();
  const output: s.SdiPetstoreUser = {
    id,
    name: fullName || raw.username || `User ${id}`,
    firstName: raw.firstName,
    lastName: raw.lastName,
    email: raw.email,
    phone: raw.phone,
    userStatus: raw.userStatus,
  };
  return output;
}
