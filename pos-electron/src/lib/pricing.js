export function computeLinePrice(item, dailyRatePerGram = 0) {
  const weight = Number(item.weight_grams || 0);
  const purityFactor = Number(item.purity_factor || 0);
  const makingCharges = Number(item.making_charges || 0);
  const wastagePercent = Number(item.wastage_percent || 0);
  const stoneCharges = Number(item.stone_charges || 0);
  const gstPercent = Number(item.gst_percent || 3);

  const metalBase = weight * dailyRatePerGram * purityFactor;
  const wastageAmount = (metalBase * wastagePercent) / 100;
  const taxable = metalBase + makingCharges + wastageAmount + stoneCharges;
  const gstAmount = (taxable * gstPercent) / 100;
  const total = taxable + gstAmount;

  return {
    taxable,
    gstAmount,
    cgst: gstAmount / 2,
    sgst: gstAmount / 2,
    total
  };
}
