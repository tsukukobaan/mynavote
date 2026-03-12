"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Candidate {
  id: string;
  name: string;
  profile: string | null;
  displayOrder: number;
}

interface Election {
  id: string;
  title: string;
  description: string | null;
  status: string;
  districtId: string | null;
  votingStartAt: string;
  votingEndAt: string;
  allowRevote: boolean;
  publicKey: string;
  candidates: Candidate[];
  voteCount: number;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "準備中",
  OPEN: "投票受付中",
  CLOSED: "投票締切",
  COUNTING: "開票中",
  FINALIZED: "確定済み",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  OPEN: "bg-green-100 text-green-800",
  CLOSED: "bg-yellow-100 text-yellow-800",
  COUNTING: "bg-purple-100 text-purple-800",
  FINALIZED: "bg-blue-100 text-blue-800",
};

const NEXT_STATUS: Record<string, string | null> = {
  DRAFT: "OPEN",
  OPEN: "CLOSED",
  CLOSED: "COUNTING",
  COUNTING: null, // FINALIZED is done via counting API
  FINALIZED: null,
};

const NEXT_ACTION_LABEL: Record<string, string> = {
  DRAFT: "投票を開始する（OPEN）",
  OPEN: "投票を締め切る（CLOSED）",
  CLOSED: "開票フェーズへ移行（COUNTING）",
};

const NEXT_ACTION_CONFIRM: Record<string, string> = {
  DRAFT: "投票を開始しますか？開始後は候補者の変更ができなくなります。",
  OPEN: "投票を締め切りますか？締め切り後は新たな投票を受け付けません。",
  CLOSED: "開票フェーズに移行しますか？",
};

const NEXT_ACTION_COLOR: Record<string, string> = {
  DRAFT: "bg-green-600 hover:bg-green-700",
  OPEN: "bg-yellow-600 hover:bg-yellow-700",
  CLOSED: "bg-purple-600 hover:bg-purple-700",
};

export default function AdminElectionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [election, setElection] = useState<Election | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchElection = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/elections", {
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? ""}`,
        },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      const found = data.elections?.find(
        (e: Election) => e.id === id
      );
      if (!found) throw new Error("選挙が見つかりません");
      setElection(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchElection();
  }, [fetchElection]);

  async function handleStatusChange() {
    if (!election) return;
    const nextStatus = NEXT_STATUS[election.status];
    if (!nextStatus) return;

    const confirmMsg = NEXT_ACTION_CONFIRM[election.status];
    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setUpdating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/elections/${id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? ""}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "ステータス変更に失敗しました");
      }

      const data = await res.json();
      setElection((prev) =>
        prev ? { ...prev, status: data.election.status } : prev
      );
      setSuccessMsg(
        `ステータスを「${STATUS_LABEL[nextStatus]}」に変更しました`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  if (!election) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600 mb-4">{error || "選挙が見つかりません"}</p>
            <Link href="/" className="text-blue-600 hover:underline text-sm">
              トップに戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const nextStatus = NEXT_STATUS[election.status];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Link
            href="/"
            className="text-blue-600 hover:underline text-sm"
          >
            トップ
          </Link>
          <span className="text-gray-400 text-sm">/</span>
          <span className="text-gray-600 text-sm">選挙管理</span>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 mb-4 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-300 text-green-700 rounded p-3 mb-4 text-sm">
            {successMsg}
          </div>
        )}

        {/* Election Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {election.title}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[election.status] ?? "bg-gray-100 text-gray-800"}`}
            >
              {STATUS_LABEL[election.status] ?? election.status}
            </span>
          </div>

          {election.description && (
            <p className="text-gray-600 mb-4">{election.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-semibold text-gray-500">選挙ID</span>
              <p className="text-gray-900 font-mono text-xs mt-0.5">
                {election.id}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-500">対象選挙区</span>
              <p className="text-gray-900 mt-0.5">
                {election.districtId ?? "制限なし（全国）"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-500">投票開始</span>
              <p className="text-gray-900 mt-0.5">
                {new Date(election.votingStartAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-500">投票終了</span>
              <p className="text-gray-900 mt-0.5">
                {new Date(election.votingEndAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-500">再投票</span>
              <p className="text-gray-900 mt-0.5">
                {election.allowRevote ? "許可" : "不可"}
              </p>
            </div>
            <div>
              <span className="font-semibold text-gray-500">現在の投票数</span>
              <p className="text-gray-900 mt-0.5 text-lg font-semibold">
                {election.voteCount}
              </p>
            </div>
          </div>
        </div>

        {/* Candidates */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            候補者一覧
          </h2>
          <div className="space-y-3">
            {election.candidates
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((c) => (
                <div
                  key={c.id}
                  className="border border-gray-200 rounded p-3"
                >
                  <p className="font-medium text-gray-900">{c.name}</p>
                  {c.profile && (
                    <p className="text-sm text-gray-600 mt-1">{c.profile}</p>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* Status Change */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            ステータス管理
          </h2>

          {/* Status flow visualization */}
          <div className="flex items-center gap-1 mb-6 flex-wrap">
            {["DRAFT", "OPEN", "CLOSED", "COUNTING", "FINALIZED"].map(
              (s, i) => (
                <div key={s} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className="text-gray-400 text-xs mx-1">&rarr;</span>
                  )}
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      s === election.status
                        ? STATUS_COLOR[s]
                        : "bg-gray-50 text-gray-400"
                    } ${s === election.status ? "ring-2 ring-offset-1 ring-gray-300" : ""}`}
                  >
                    {STATUS_LABEL[s]}
                  </span>
                </div>
              )
            )}
          </div>

          {nextStatus ? (
            <div>
              <p className="text-sm text-gray-600 mb-3">
                次のステータス：
                <span className="font-semibold">
                  {STATUS_LABEL[nextStatus]}
                </span>
              </p>
              <button
                onClick={handleStatusChange}
                disabled={updating}
                className={`px-6 py-3 text-white font-semibold rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed ${NEXT_ACTION_COLOR[election.status] ?? "bg-gray-600 hover:bg-gray-700"}`}
              >
                {updating
                  ? "変更中..."
                  : NEXT_ACTION_LABEL[election.status] ?? `${STATUS_LABEL[nextStatus]}に変更`}
              </button>
            </div>
          ) : election.status === "COUNTING" ? (
            <p className="text-sm text-gray-600">
              開票処理は
              <span className="font-semibold">開票UI</span>
              から秘密鍵を入力して実行してください。
              開票が完了するとFINALIZEDに移行します。
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              この選挙は確定済みです。ステータスの変更はできません。
            </p>
          )}
        </div>

        {/* Links */}
        <div className="flex gap-4 justify-center text-sm">
          <Link
            href={`/elections/${election.id}`}
            className="text-blue-600 hover:underline"
          >
            投票ページを見る
          </Link>
          <Link href="/" className="text-blue-600 hover:underline">
            トップに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
