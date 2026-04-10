/* eslint-disable no-console */
require("dotenv").config();

const { createPrismaForScripts } = require("./prisma-for-scripts");

async function main() {
  const companyId = process.argv[2] || "comp1";
  const category = process.argv[3] || "B";

  const prisma = createPrismaForScripts();
  try {
    const res = await prisma.car.updateMany({
      where: {
        companyId,
        OR: [{ vehicleCategory: "OTHER" }],
      },
      data: { vehicleCategory: category },
    });
    console.log(`[backfill-comp1-vehicle-category] companyId=${companyId} set=${category} updated=${res.count}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

