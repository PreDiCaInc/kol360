# Migration Notes: Add isLite and HCP Exclusions

## Changes Made

### 1. Client Model
- Added `isLite` boolean field (default: false)
- Added index on `isLite` field
- Added relation to `ClientHcpExclusion` model

### 2. ClientHcpExclusion Model (New)
This model stores client-level HCP exclusions. HCPs excluded at the client level won't appear in any campaigns for that client.

Fields:
- `id`: Unique identifier
- `clientId`: Reference to Client
- `hcpId`: Reference to HCP
- `reason`: Optional reason for exclusion
- `createdBy`: User who created the exclusion
- `createdAt`, `updatedAt`: Timestamps

Indexes:
- Unique constraint on `[clientId, hcpId]`
- Index on `clientId`
- Index on `hcpId`

### 3. CampaignHcpExclusion Model (New)
This model stores campaign-level HCP exclusions. HCPs excluded at the campaign level won't appear in that specific campaign.

Fields:
- `id`: Unique identifier
- `campaignId`: Reference to Campaign
- `hcpId`: Reference to HCP
- `reason`: Optional reason for exclusion
- `createdBy`: User who created the exclusion
- `createdAt`, `updatedAt`: Timestamps

Indexes:
- Unique constraint on `[campaignId, hcpId]`
- Index on `campaignId`
- Index on `hcpId`

### 4. Campaign Model
- Added relation to `CampaignHcpExclusion` model

### 5. Hcp Model
- Added relation to `ClientHcpExclusion` model
- Added relation to `CampaignHcpExclusion` model

## Migration Command
To apply this migration:
```bash
cd apps/api
npx prisma migrate dev --name add_islite_and_hcp_exclusions
```

Or to generate the client only:
```bash
npx prisma generate
```
