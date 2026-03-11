import { describe, it, expect } from "vitest";
import { extractMunicipality, getDistrict, isEligibleForElection } from "@/lib/district";

describe("extractMunicipality", () => {
  // Basic patterns
  it("extracts regular city: 松戸市", () => {
    expect(extractMunicipality("千葉県松戸市根本387番地の5")).toBe("松戸市");
  });

  it("extracts Tokyo 23 ward: 千代田区", () => {
    expect(extractMunicipality("東京都千代田区永田町1丁目7番1号")).toBe("千代田区");
  });

  it("extracts Tokyo 23 ward: 港区", () => {
    expect(extractMunicipality("東京都港区赤坂1丁目2番3号")).toBe("港区");
  });

  it("extracts seirei-shitei city ward: 千葉市中央区", () => {
    expect(extractMunicipality("千葉県千葉市中央区中央港1丁目")).toBe("千葉市中央区");
  });

  it("extracts hiragana seirei city: さいたま市大宮区", () => {
    expect(extractMunicipality("埼玉県さいたま市大宮区桜木町1丁目7番5号")).toBe("さいたま市大宮区");
  });

  it("extracts seirei city: 横浜市西区", () => {
    expect(extractMunicipality("神奈川県横浜市西区みなとみらい2丁目")).toBe("横浜市西区");
  });

  // Edge cases
  it("extracts long hiragana city: つくばみらい市", () => {
    expect(extractMunicipality("茨城県つくばみらい市板橋1234")).toBe("つくばみらい市");
  });

  it("extracts long hiragana city: かすみがうら市", () => {
    expect(extractMunicipality("茨城県かすみがうら市上土田500")).toBe("かすみがうら市");
  });

  it("extracts Hokkaido seirei city: 札幌市中央区", () => {
    expect(extractMunicipality("北海道札幌市中央区北1条西2丁目")).toBe("札幌市中央区");
  });

  it("extracts Kyoto seirei city: 京都市左京区", () => {
    expect(extractMunicipality("京都府京都市左京区吉田本町")).toBe("京都市左京区");
  });

  it("extracts Osaka seirei city: 大阪市北区", () => {
    expect(extractMunicipality("大阪府大阪市北区中之島1丁目")).toBe("大阪市北区");
  });

  it("extracts Sakai city ward: 堺市堺区", () => {
    expect(extractMunicipality("大阪府堺市堺区南瓦町3番1号")).toBe("堺市堺区");
  });

  it("extracts county town: 北葛飾郡杉戸町", () => {
    expect(extractMunicipality("千葉県北葛飾郡杉戸町清地2丁目")).toBe("北葛飾郡杉戸町");
  });

  it("extracts county village: 西多摩郡檜原村", () => {
    expect(extractMunicipality("東京都西多摩郡檜原村467番地")).toBe("西多摩郡檜原村");
  });

  it("extracts city with same name as prefecture: 鹿児島市", () => {
    expect(extractMunicipality("鹿児島県鹿児島市山下町15番1号")).toBe("鹿児島市");
  });

  it("extracts hiragana city: うるま市", () => {
    expect(extractMunicipality("沖縄県うるま市みどり町1丁目1番1号")).toBe("うるま市");
  });

  it("extracts katakana county town: 虻田郡ニセコ町", () => {
    expect(extractMunicipality("北海道虻田郡ニセコ町字本通105番地")).toBe("虻田郡ニセコ町");
  });

  // Error cases
  it("returns null for address without prefecture", () => {
    expect(extractMunicipality("松戸市根本387番地")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractMunicipality("")).toBeNull();
  });

  it("returns null for non-Japanese address", () => {
    expect(extractMunicipality("アメリカ合衆国")).toBeNull();
  });
});

describe("getDistrict", () => {
  it("returns 千葉6区 for 松戸市 address", () => {
    expect(getDistrict("千葉県松戸市根本387番地の5")).toBe("千葉6区");
  });

  it("returns 東京1区 for 千代田区 address", () => {
    expect(getDistrict("東京都千代田区永田町1丁目7番1号")).toBe("東京1区");
  });

  it("returns 東京1区 for 港区 address", () => {
    expect(getDistrict("東京都港区赤坂1丁目")).toBe("東京1区");
  });

  it("returns 東京1区 for 新宿区 address", () => {
    expect(getDistrict("東京都新宿区歌舞伎町1丁目")).toBe("東京1区");
  });

  it("returns null for address not in any registered district", () => {
    expect(getDistrict("福岡県福岡市博多区博多駅前1丁目")).toBeNull();
  });
});

describe("isEligibleForElection", () => {
  it("returns true when district matches", () => {
    expect(isEligibleForElection("千葉県松戸市根本387番地の5", "千葉6区")).toBe(true);
  });

  it("returns false when district does not match", () => {
    expect(isEligibleForElection("東京都千代田区永田町1丁目", "千葉6区")).toBe(false);
  });

  it("returns true when election has no district restriction", () => {
    expect(isEligibleForElection("東京都千代田区永田町1丁目", null)).toBe(true);
  });
});
