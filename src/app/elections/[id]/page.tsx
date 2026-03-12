"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

// --- Types ---

interface Candidate {
  id: string;
  name: string;
  profile: string | null;
}

interface ElectionResult {
  candidateId: string;
  voteCount: number;
}

interface ElectionData {
  id: string;
  title: string;
  description: string | null;
  status: "DRAFT" | "OPEN" | "CLOSED" | "COUNTING" | "FINALIZED";
  districtId: string | null;
  votingStartAt: string;
  votingEndAt: string;
  publicKey: string;
  allowRevote: boolean;
  candidates: Candidate[];
  voteCount: number;
  results?: ElectionResult[];
}

interface MockUser {
  sub: string;
  name: string;
  address: string;
}

type Step =
  | "info"
  | "select"
  | "confirm"
  | "auth"
  | "ineligible"
  | "encrypting"
  | "complete"
  | "error";

// --- Helpers ---

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABELS: Record<ElectionData["status"], string> = {
  DRAFT: "準備中",
  OPEN: "投票受付中",
  CLOSED: "投票締切",
  COUNTING: "開票中",
  FINALIZED: "確定済み",
};

// --- Component ---

export default function ElectionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [election, setElection] = useState<ElectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Step management
  const [step, setStep] = useState<Step>("info");

  // Auth
  const [mockUsers, setMockUsers] = useState<MockUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [authenticating, setAuthenticating] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [authDistrict, setAuthDistrict] = useState<string | null>(null);

  // Voting
  const [shuffledCandidates, setShuffledCandidates] = useState<Candidate[]>(
    []
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState<
    string | null
  >(null);

  // Result
  const [ballotTracker, setBallotTracker] = useState<string | null>(null);
  const [isRevote, setIsRevote] = useState(false);
  const [copied, setCopied] = useState(false);

  // --- Fetch election data ---

  const fetchElection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/elections/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError("選挙が見つかりません。");
        } else {
          setError("選挙データの取得に失敗しました。");
        }
        return;
      }
      const data: ElectionData = await res.json();
      setElection(data);
    } catch {
      setError("通信エラーが発生しました。");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchElection();
  }, [id, fetchElection]);

  // --- Handlers ---

  function handleStartVoting() {
    if (!election) return;
    setShuffledCandidates(shuffleArray(election.candidates));
    setStep("select");
  }

  function handleSelectCandidate() {
    if (!selectedCandidateId) return;
    setStep("confirm");
  }

  async function handleStartAuth() {
    // When user clicks "暗号化して投票する", start auth flow
    try {
      const res = await fetch("/api/auth/mock");
      if (!res.ok) {
        setError("モック認証ユーザーの取得に失敗しました。");
        setStep("error");
        return;
      }
      const data = await res.json();
      setMockUsers(data.users);
      setStep("auth");
    } catch {
      setError("通信エラーが発生しました。");
      setStep("error");
    }
  }

  async function handleAuthenticateAndVote() {
    if (!selectedUserId || !election) return;

    setAuthenticating(true);
    try {
      // 1. Authenticate
      const authRes = await fetch("/api/auth/mock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          electionId: election.id,
        }),
      });

      if (authRes.status === 429) {
        setError(
          "認証の試行回数が上限に達しました。しばらくしてから再度お試しください。"
        );
        setStep("error");
        return;
      }

      if (!authRes.ok) {
        setError("認証に失敗しました。");
        setStep("error");
        return;
      }

      const authData = await authRes.json();
      setCsrfToken(authData.csrfToken);
      setAuthDistrict(authData.district);

      // 2. Check eligibility
      if (election.districtId && authData.district !== election.districtId) {
        setStep("ineligible");
        return;
      }

      // 3. Proceed to encrypt and vote
      setStep("encrypting");
      await encryptAndSubmitVote(authData.csrfToken);
    } catch {
      setError("通信エラーが発生しました。");
      setStep("error");
    } finally {
      setAuthenticating(false);
    }
  }

  async function encryptAndSubmitVote(token: string) {
    if (!selectedCandidateId || !election) return;

    try {
      // Dynamically import libsodium
      const _sodium = (await import("libsodium-wrappers")).default;
      await _sodium.ready;

      const publicKey = _sodium.from_base64(election.publicKey);

      // Create ballot payload with random nonce (IVXV-style)
      const ballot = JSON.stringify({
        candidateId: selectedCandidateId,
        nonce: _sodium.to_base64(_sodium.randombytes_buf(32)),
        timestamp: new Date().toISOString(),
      });

      // Encrypt with sealed box (anonymous encryption)
      const encrypted = _sodium.crypto_box_seal(
        _sodium.from_string(ballot),
        publicKey
      );
      const encryptedVoteB64 = _sodium.to_base64(encrypted);

      // Generate ballot tracker (hash of encrypted vote)
      const hash = _sodium.crypto_generichash(
        32,
        _sodium.from_base64(encryptedVoteB64),
        null
      );
      const tracker = _sodium.to_base64(hash);

      // Submit vote
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          electionId: election.id,
          encryptedVote: encryptedVoteB64,
          ballotTracker: tracker,
          csrfToken: token,
        }),
      });

      if (res.status === 429) {
        setError(
          "投票の試行回数が上限に達しました。しばらくしてから再度お試しください。"
        );
        setStep("error");
        return;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        setError(errData?.error ?? "投票の送信に失敗しました。");
        setStep("error");
        return;
      }

      const data = await res.json();
      setBallotTracker(data.ballotTracker);
      setIsRevote(data.isRevote);
      setStep("complete");
    } catch {
      setError("投票処理中にエラーが発生しました。");
      setStep("error");
    }
  }

  function handleCopyTracker() {
    if (!ballotTracker) return;
    navigator.clipboard.writeText(ballotTracker).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleReset() {
    setStep("info");
    setSelectedUserId(null);
    setSelectedCandidateId(null);
    setCsrfToken(null);
    setAuthDistrict(null);
    setBallotTracker(null);
    setIsRevote(false);
    setError(null);
    fetchElection();
  }

  // --- Render helpers ---

  function getCandidateName(candidateId: string): string {
    return (
      election?.candidates.find((c) => c.id === candidateId)?.name ?? "不明"
    );
  }

  // --- Loading / Error states ---

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-lg">読み込み中...</p>
      </div>
    );
  }

  if (error && step !== "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full text-center">
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  if (!election) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-lg">選挙が見つかりません。</p>
      </div>
    );
  }

  // --- Main render ---

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Election header (always visible) */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {election.title}
          </h1>
          {election.description && (
            <p className="text-gray-600 mb-4">{election.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                election.status === "OPEN"
                  ? "bg-green-100 text-green-800"
                  : election.status === "FINALIZED"
                    ? "bg-blue-100 text-blue-800"
                    : "bg-gray-100 text-gray-800"
              }`}
            >
              {STATUS_LABELS[election.status]}
            </span>
            {election.districtId && (
              <span>対象選挙区: {election.districtId}</span>
            )}
          </div>
          <div className="mt-3 text-sm text-gray-500">
            <p>
              投票期間: {formatDateTime(election.votingStartAt)} 〜{" "}
              {formatDateTime(election.votingEndAt)}
            </p>
          </div>
        </div>

        {/* Step: Info (default) */}
        {step === "info" && (
          <>
            {/* Candidates list */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                候補者
              </h2>
              <div className="space-y-4">
                {election.candidates.map((c) => (
                  <div
                    key={c.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <h3 className="font-medium text-gray-900">{c.name}</h3>
                    {c.profile && (
                      <p className="text-gray-600 text-sm mt-1">{c.profile}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Results (if finalized) */}
            {election.status === "FINALIZED" && election.results && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  開票結果
                </h2>
                <div className="space-y-3">
                  {election.results
                    .sort((a, b) => b.voteCount - a.voteCount)
                    .map((r) => {
                      const totalVotes = election.results!.reduce(
                        (sum, x) => sum + x.voteCount,
                        0
                      );
                      const pct =
                        totalVotes > 0
                          ? ((r.voteCount / totalVotes) * 100).toFixed(1)
                          : "0";
                      return (
                        <div
                          key={r.candidateId}
                          className="border border-gray-200 rounded-lg p-4"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-medium text-gray-900">
                              {getCandidateName(r.candidateId)}
                            </span>
                            <span className="text-gray-700 font-semibold">
                              {r.voteCount}票 ({pct}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                              className="bg-blue-600 h-2.5 rounded-full transition-all"
                              style={{
                                width: `${totalVotes > 0 ? (r.voteCount / totalVotes) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                <p className="text-sm text-gray-500 mt-4">
                  総投票数:{" "}
                  {election.results.reduce((s, r) => s + r.voteCount, 0)}票
                </p>
              </div>
            )}

            {/* Vote button (if open) */}
            {election.status === "OPEN" && (
              <div className="text-center">
                <button
                  onClick={handleStartVoting}
                  className="px-6 py-3 bg-blue-600 text-white text-lg font-medium rounded-lg hover:bg-blue-700 transition shadow"
                >
                  投票する
                </button>
                {election.allowRevote && (
                  <p className="text-sm text-gray-500 mt-3">
                    投票期間中は再投票が可能です。再投票した場合、最後の投票のみが有効です。
                  </p>
                )}
              </div>
            )}

            {election.status === "DRAFT" && (
              <div className="text-center">
                <p className="text-gray-500">
                  この選挙はまだ開始されていません。
                </p>
              </div>
            )}
            {election.status === "CLOSED" && (
              <div className="text-center">
                <p className="text-gray-500">投票は締め切られました。</p>
              </div>
            )}
            {election.status === "COUNTING" && (
              <div className="text-center">
                <p className="text-gray-500">現在開票作業中です。</p>
              </div>
            )}
          </>
        )}

        {/* Step: Select candidate */}
        {step === "select" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              投票する候補者を選んでください
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              候補者の表示順はランダム化されています
            </p>
            <div className="space-y-3 mb-6">
              {shuffledCandidates.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition ${
                    selectedCandidateId === c.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="candidate"
                    value={c.id}
                    checked={selectedCandidateId === c.id}
                    onChange={() => setSelectedCandidateId(c.id)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.profile && (
                      <p className="text-sm text-gray-500 mt-1">{c.profile}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep("info");
                  setSelectedCandidateId(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                戻る
              </button>
              <button
                onClick={handleSelectCandidate}
                disabled={!selectedCandidateId}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                確認画面へ
              </button>
            </div>
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && selectedCandidateId && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              あなたの投票内容を確認してください
            </h2>
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600">選択した候補者:</p>
              <p className="text-xl font-bold text-gray-900 mt-1">
                {getCandidateName(selectedCandidateId)}
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-6">
              「暗号化して投票する」を押すと、マイナンバーカード認証（モック）の後、投票内容がブラウザ内で暗号化されサーバーに送信されます。サーバーは投票内容の平文を見ることができません。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("select")}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                選び直す
              </button>
              <button
                onClick={handleStartAuth}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                暗号化して投票する
              </button>
            </div>
          </div>
        )}

        {/* Step: Auth (mock) - shown after clicking "暗号化して投票する" */}
        {step === "auth" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              本人認証（モック）
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              テスト用のユーザーを選択してください。本番環境ではデジタル認証アプリによる認証が行われます。
            </p>
            <div className="space-y-3 mb-6">
              {mockUsers.map((u) => (
                <label
                  key={u.sub}
                  className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition ${
                    selectedUserId === u.sub
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="mock-user"
                    value={u.sub}
                    checked={selectedUserId === u.sub}
                    onChange={() => setSelectedUserId(u.sub)}
                    className="mt-1"
                  />
                  <div>
                    <p className="font-medium text-gray-900">{u.name}</p>
                    <p className="text-sm text-gray-500">{u.address}</p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep("confirm");
                  setSelectedUserId(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                戻る
              </button>
              <button
                onClick={handleAuthenticateAndVote}
                disabled={!selectedUserId || authenticating}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {authenticating ? "認証・投票中..." : "認証して投票を送信する"}
              </button>
            </div>
          </div>
        )}

        {/* Step: Ineligible */}
        {step === "ineligible" && (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-red-500 text-4xl mb-4">&#x2716;</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              この選挙の投票資格がありません
            </h2>
            <p className="text-gray-600 mb-2">
              この選挙は{election.districtId}を対象としていますが、
              あなたの選挙区は{authDistrict ?? "判定不能"}です。
            </p>
            <p className="text-sm text-gray-500 mb-6">
              住所に基づく選挙区が対象地域と一致しないため、投票できません。
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              選挙トップに戻る
            </button>
          </div>
        )}

        {/* Step: Encrypting */}
        {step === "encrypting" && (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="animate-spin inline-block w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full mb-4" />
            <p className="text-gray-700">
              投票内容を暗号化して送信しています...
            </p>
            <p className="text-xs text-gray-400 mt-2">
              ブラウザ内で暗号化処理を行っています。サーバーには平文を送信しません。
            </p>
          </div>
        )}

        {/* Step: Complete */}
        {step === "complete" && (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-green-500 text-5xl mb-4">&#x2714;</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {isRevote ? "再投票が完了しました" : "投票が完了しました"}
            </h2>
            {isRevote && (
              <p className="text-sm text-amber-600 mb-4">
                前回の投票は無効となり、今回の投票が有効です。
              </p>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">
                あなたの Ballot Tracker:
              </p>
              <p className="font-mono text-sm text-gray-900 break-all">
                {ballotTracker}
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              この文字列を記録しておいてください。投票が正しく記録されたことを後から確認できます。
            </p>
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={handleCopyTracker}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                {copied ? "コピーしました" : "Ballot Trackerをコピー"}
              </button>
              {election.allowRevote && (
                <p className="text-xs text-gray-400">
                  投票期間中は再投票が可能です。再投票した場合、最後の投票のみが有効です。
                </p>
              )}
              <button
                onClick={handleReset}
                className="px-4 py-2 text-blue-600 hover:text-blue-800 transition"
              >
                選挙トップに戻る
              </button>
            </div>
          </div>
        )}

        {/* Step: Error */}
        {step === "error" && (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-red-500 text-4xl mb-4">&#x26A0;</div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              エラーが発生しました
            </h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={handleReset}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
            >
              選挙トップに戻る
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
