import districtData from "@/data/districts.json";

const SEIREI_SHITEI_CITIES = [
  "札幌市",
  "仙台市",
  "さいたま市",
  "千葉市",
  "横浜市",
  "川崎市",
  "相模原市",
  "新潟市",
  "静岡市",
  "浜松市",
  "名古屋市",
  "京都市",
  "大阪市",
  "堺市",
  "神戸市",
  "岡山市",
  "広島市",
  "北九州市",
  "福岡市",
  "熊本市",
];

interface DistrictEntry {
  name: string;
  prefecture: string;
  municipalities: string[];
}

const DISTRICT_MAP: Record<string, DistrictEntry> = districtData;

export function extractMunicipality(address: string): string | null {
  if (!address) return null;

  // Step 1: Remove prefecture
  const prefecturePattern =
    /^(?:東京都|北海道|(?:京都|大阪)府|.{2,3}県)/;
  const prefMatch = address.match(prefecturePattern);
  if (!prefMatch) return null;

  const afterPref = address.slice(prefMatch[0].length);

  // Step 2: Seirei-shitei city ward (e.g., "千葉市中央区", "さいたま市大宮区")
  const seireichMatch = afterPref.match(/^(.+?市)(.{1,4}区)/);
  if (seireichMatch) {
    const cityName = seireichMatch[1];
    if (SEIREI_SHITEI_CITIES.includes(cityName)) {
      return cityName + seireichMatch[2];
    }
  }

  // Step 3: Tokyo 23 wards
  if (address.startsWith("東京都")) {
    const kuMatch = afterPref.match(/^(.{1,4}区)/);
    if (kuMatch) return kuMatch[1];
  }

  // Step 4: Regular city (support long hiragana names up to 8 chars)
  const shiMatch = afterPref.match(/^(.{1,8}?市)/);
  if (shiMatch) return shiMatch[1];

  // Step 5: Gun (county) - town/village
  const gunMatch = afterPref.match(/^(.{1,5}郡)(.{1,6}?(?:町|村))/);
  if (gunMatch) return gunMatch[1] + gunMatch[2];

  return null;
}

export function getDistrict(address: string): string | null {
  const municipality = extractMunicipality(address);
  if (!municipality) return null;

  for (const [districtId, entry] of Object.entries(DISTRICT_MAP)) {
    if (entry.municipalities.includes(municipality)) {
      return districtId;
    }
  }
  return null;
}

export function isEligibleForElection(
  voterAddress: string,
  electionDistrictId: string | null
): boolean {
  // If election has no district restriction, everyone is eligible
  if (!electionDistrictId) return true;

  const voterDistrict = getDistrict(voterAddress);
  return voterDistrict === electionDistrictId;
}

export function getDistrictName(districtId: string): string | null {
  return DISTRICT_MAP[districtId]?.name ?? null;
}
