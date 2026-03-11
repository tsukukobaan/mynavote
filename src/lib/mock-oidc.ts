export interface MockUser {
  sub: string;
  name: string;
  address: string;
  birthdate: string;
  gender: string;
}

export const MOCK_USERS: MockUser[] = [
  {
    sub: "mock-user-001-ppid",
    name: "山田 太郎",
    address: "千葉県松戸市根本387番地の5",
    birthdate: "19850315",
    gender: "1",
  },
  {
    sub: "mock-user-002-ppid",
    name: "佐藤 花子",
    address: "千葉県松戸市小根本45番地3",
    birthdate: "19900721",
    gender: "2",
  },
  {
    sub: "mock-user-003-ppid",
    name: "鈴木 一郎",
    address: "東京都千代田区永田町1丁目7番1号",
    birthdate: "19780110",
    gender: "1",
  },
];

export function getMockUserInfo(userId: string): MockUser | null {
  return MOCK_USERS.find((u) => u.sub === userId) ?? null;
}
