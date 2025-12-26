-- CreateTable
CREATE TABLE "Specialty" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HcpSpecialty" (
    "id" TEXT NOT NULL,
    "hcpId" TEXT NOT NULL,
    "specialtyId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HcpSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_name_key" ON "Specialty"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_code_key" ON "Specialty"("code");

-- CreateIndex
CREATE INDEX "Specialty_category_idx" ON "Specialty"("category");

-- CreateIndex
CREATE INDEX "Specialty_isActive_idx" ON "Specialty"("isActive");

-- CreateIndex
CREATE INDEX "HcpSpecialty_hcpId_idx" ON "HcpSpecialty"("hcpId");

-- CreateIndex
CREATE INDEX "HcpSpecialty_specialtyId_idx" ON "HcpSpecialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "HcpSpecialty_hcpId_specialtyId_key" ON "HcpSpecialty"("hcpId", "specialtyId");

-- AddForeignKey
ALTER TABLE "HcpSpecialty" ADD CONSTRAINT "HcpSpecialty_hcpId_fkey" FOREIGN KEY ("hcpId") REFERENCES "Hcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HcpSpecialty" ADD CONSTRAINT "HcpSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing specialty data
-- First, insert unique specialties from existing HCP data
INSERT INTO "Specialty" ("id", "name", "code", "category", "updatedAt")
SELECT
    gen_random_uuid()::text,
    TRIM(specialty),
    LOWER(REGEXP_REPLACE(TRIM(specialty), '[^a-zA-Z0-9]', '_', 'g')),
    NULL,
    NOW()
FROM "Hcp"
WHERE specialty IS NOT NULL AND TRIM(specialty) != ''
GROUP BY TRIM(specialty)
ON CONFLICT (name) DO NOTHING;

-- Link existing HCPs to their specialties
INSERT INTO "HcpSpecialty" ("id", "hcpId", "specialtyId", "isPrimary")
SELECT
    gen_random_uuid()::text,
    h.id,
    s.id,
    true
FROM "Hcp" h
JOIN "Specialty" s ON TRIM(h.specialty) = s.name
WHERE h.specialty IS NOT NULL AND TRIM(h.specialty) != '';
