-- Meta Click-to-WhatsApp attribution fields.
-- acquisitionSource: e.g. "ad:12345678" (source_type:source_id from referral object)
-- ctwaClid: the click ID Meta sends for ad attribution reporting
ALTER TABLE "User" ADD COLUMN "acquisitionSource" TEXT;
ALTER TABLE "User" ADD COLUMN "ctwaClid" TEXT;
