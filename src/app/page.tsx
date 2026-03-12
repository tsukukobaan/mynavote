"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Election {
  id: string;
  title: string;
  description?: string;
  status: string;
  districtId?: string;
  votingStartAt: string;
  votingEndAt: string;
  voteCount: number;
  candidates: { id: string; name: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "準備中",
  OPEN: "投票受付中",
  CLOSED: "投票締切",
  COUNTING: "開票中",
  FINALIZED: "確定済み",
};

export default function Home() {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/elections", {
      headers: {
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? ""}`,
      },
    })
      .then((r) => r.json())
      .then((data) => setElections(data.elections ?? []))
      .catch(() => setElections([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">MynaVote</h1>
        <p className="text-gray-600 mb-8">
          マイナンバーカード認証オンライン投票
        </p>

        {loading ? (
          <p className="text-gray-500">読み込み中...</p>
        ) : elections.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500 mb-4">選挙がまだ作成されていません</p>
            <Link
              href="/admin/elections/new"
              className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              選挙を作成する（管理者）
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {elections.map((e) => (
              <Link
                key={e.id}
                href={`/elections/${e.id}`}
                className="block bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {e.title}
                    </h2>
                    {e.description && (
                      <p className="text-gray-600 mt-1">{e.description}</p>
                    )}
                    <p className="text-sm text-gray-500 mt-2">
                      投票期間:{" "}
                      {new Date(e.votingStartAt).toLocaleString("ja-JP")} 〜{" "}
                      {new Date(e.votingEndAt).toLocaleString("ja-JP")}
                    </p>
                    {e.districtId && (
                      <p className="text-sm text-gray-500">
                        対象選挙区: {e.districtId}
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      e.status === "OPEN"
                        ? "bg-green-100 text-green-800"
                        : e.status === "FINALIZED"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {STATUS_LABEL[e.status] ?? e.status}
                  </span>
                </div>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-sm text-gray-500">
                    候補者: {e.candidates.map((c) => c.name).join("、")} / 投票数:{" "}
                    {e.voteCount}
                  </span>
                  <Link
                    href={`/admin/elections/${e.id}`}
                    className="text-xs text-gray-400 hover:text-blue-600 hover:underline ml-4 shrink-0"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    管理
                  </Link>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/admin/elections/new"
            className="text-blue-600 hover:underline text-sm"
          >
            管理者: 新しい選挙を作成
          </Link>
        </div>
      </div>
    </main>
  );
}
