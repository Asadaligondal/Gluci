-- CreateTable
CREATE TABLE "gi_food" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "name_lower" TEXT NOT NULL,
    "gi_value" DOUBLE PRECISION NOT NULL,
    "carbs_per_100g" DOUBLE PRECISION,
    "category" TEXT,
    "source" TEXT NOT NULL DEFAULT 'auto',

    CONSTRAINT "gi_food_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gi_food_name_lower_key" ON "gi_food"("name_lower");

CREATE INDEX "gi_food_name_lower_idx" ON "gi_food"("name_lower");
