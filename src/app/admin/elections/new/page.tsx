"use client";

import { useState } from "react";

interface CandidateInput {
  name: string;
  profile: string;
}

interface CreatedElection {
  id: string;
  title: string;
  status: string;
  publicKey: string;
  candidates: { id: string; name: string; profile: string | null }[];
}

interface ValidationErrors {
  title?: string;
  votingStartAt?: string;
  votingEndAt?: string;
  candidates?: string;
  candidateNames?: Record<number, string>;
  general?: string;
}

type Step = "edit" | "confirm" | "done";

const INPUT_CLASS =
  "w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

export default function NewElectionPage() {
  const [step, setStep] = useState<Step>("edit");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [votingStartAt, setVotingStartAt] = useState("");
  const [votingEndAt, setVotingEndAt] = useState("");
  const [allowRevote, setAllowRevote] = useState(true);
  const [candidates, setCandidates] = useState<CandidateInput[]>([
    { name: "", profile: "" },
    { name: "", profile: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [createdElection, setCreatedElection] =
    useState<CreatedElection | null>(null);
  const [secretKey, setSecretKey] = useState<string | null>(null);

  function addCandidate() {
    setCandidates([...candidates, { name: "", profile: "" }]);
  }

  function removeCandidate(index: number) {
    if (candidates.length <= 2) return;
    setCandidates(candidates.filter((_, i) => i !== index));
  }

  function updateCandidate(
    index: number,
    field: keyof CandidateInput,
    value: string
  ) {
    const updated = [...candidates];
    updated[index] = { ...updated[index], [field]: value };
    setCandidates(updated);
  }

  const filledCandidates = candidates.filter((c) => c.name.trim());

  function validate(): boolean {
    const newErrors: ValidationErrors = {};
    const candidateNameErrors: Record<number, string> = {};

    if (!title.trim()) {
      newErrors.title = "選挙タイトルを入力してください";
    }
    if (!votingStartAt) {
      newErrors.votingStartAt = "投票開始日時を入力してください";
    }
    if (!votingEndAt) {
      newErrors.votingEndAt = "投票終了日時を入力してください";
    }
    if (votingStartAt && votingEndAt && votingStartAt >= votingEndAt) {
      newErrors.votingEndAt = "終了日時は開始日時より後にしてください";
    }

    if (filledCandidates.length < 2) {
      newErrors.candidates = "候補者は最低2名必要です";
    }

    candidates.forEach((c, i) => {
      if (!c.name.trim() && candidates.length <= 2) {
        candidateNameErrors[i] = "候補者名を入力してください";
      }
    });

    if (Object.keys(candidateNameErrors).length > 0) {
      newErrors.candidateNames = candidateNameErrors;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setStep("confirm");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setErrors({});

    try {
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        districtId: districtId || undefined,
        votingStartAt: new Date(votingStartAt).toISOString(),
        votingEndAt: new Date(votingEndAt).toISOString(),
        allowRevote,
        candidates: filledCandidates.map((c) => ({
          name: c.name.trim(),
          profile: c.profile.trim() || undefined,
        })),
      };

      const res = await fetch("/api/admin/elections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ADMIN_TOKEN ?? ""}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrors({
          general:
            data?.error || `エラーが発生しました（ステータス: ${res.status}）`,
        });
        setStep("edit");
        return;
      }

      const data = await res.json();
      setCreatedElection(data.election);
      setSecretKey(data.secretKey);
      setStep("done");
    } catch {
      setErrors({ general: "通信エラーが発生しました。再度お試しください。" });
      setStep("edit");
    } finally {
      setSubmitting(false);
    }
  }

  const districtLabel: Record<string, string> = {
    "千葉6区": "千葉6区（松戸市）",
    "千葉1区": "千葉1区（千葉市中央区・稲毛区・美浜区）",
    "東京1区": "東京1区（千代田区・港区・新宿区）",
    "東京2区": "東京2区（中央区・文京区・台東区）",
  };

  const formatDatetime = (v: string) =>
    v ? new Date(v).toLocaleString("ja-JP") : "";

  // === Step: Done ===
  if (step === "done" && createdElection && secretKey) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h1 className="text-2xl font-bold text-green-700 mb-4">
              選挙が作成されました
            </h1>
            <div className="space-y-3 mb-6 text-gray-900">
              <div>
                <span className="font-semibold">選挙ID：</span>
                <code className="bg-gray-100 px-2 py-0.5 rounded text-sm">
                  {createdElection.id}
                </code>
              </div>
              <div>
                <span className="font-semibold">タイトル：</span>
                {createdElection.title}
              </div>
              <div>
                <span className="font-semibold">ステータス：</span>
                {createdElection.status}（APIでOPENに変更して投票開始）
              </div>
              <div>
                <span className="font-semibold">候補者：</span>
                <ul className="list-disc list-inside ml-2 mt-1">
                  {createdElection.candidates.map((c) => (
                    <li key={c.id}>{c.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border-2 border-red-500 rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-red-700 mb-2">
              秘密鍵（開票用）
            </h2>
            <div className="bg-yellow-50 border border-yellow-400 rounded p-3 mb-4">
              <p className="text-red-800 font-bold text-sm">
                この秘密鍵は今回のみ表示されます。再表示はできません。
              </p>
              <p className="text-red-700 text-sm mt-1">
                必ず安全な場所（オフライン環境）に保存してください。
                この鍵がなければ開票（投票の復号）ができません。
              </p>
            </div>
            <textarea
              readOnly
              value={secretKey}
              rows={3}
              className="w-full font-mono text-sm text-gray-900 bg-white border border-gray-300 rounded p-3 resize-none"
            />
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(secretKey)}
              className="mt-2 px-4 py-2 bg-gray-700 text-white text-sm rounded hover:bg-gray-800"
            >
              クリップボードにコピー
            </button>
          </div>

          <div className="mt-6 flex gap-4 justify-center">
            <a
              href={`/elections/${createdElection.id}`}
              className="text-blue-600 hover:underline text-sm"
            >
              選挙ページを見る
            </a>
            <a href="/" className="text-blue-600 hover:underline text-sm">
              トップに戻る
            </a>
          </div>
        </div>
      </div>
    );
  }

  // === Step: Confirm ===
  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">
            内容を確認してください
          </h1>

          <div className="bg-white rounded-lg shadow p-6 space-y-4 text-gray-900">
            <div>
              <span className="font-semibold text-gray-600 text-sm">
                選挙タイトル
              </span>
              <p className="text-lg">{title}</p>
            </div>

            {description && (
              <div>
                <span className="font-semibold text-gray-600 text-sm">
                  説明
                </span>
                <p>{description}</p>
              </div>
            )}

            <div>
              <span className="font-semibold text-gray-600 text-sm">
                対象選挙区
              </span>
              <p>{districtId ? districtLabel[districtId] ?? districtId : "制限なし（全国）"}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-semibold text-gray-600 text-sm">
                  投票開始
                </span>
                <p>{formatDatetime(votingStartAt)}</p>
              </div>
              <div>
                <span className="font-semibold text-gray-600 text-sm">
                  投票終了
                </span>
                <p>{formatDatetime(votingEndAt)}</p>
              </div>
            </div>

            <div>
              <span className="font-semibold text-gray-600 text-sm">
                再投票
              </span>
              <p>{allowRevote ? "許可（最後の投票のみ有効）" : "不可"}</p>
            </div>

            <div>
              <span className="font-semibold text-gray-600 text-sm">
                候補者
              </span>
              <ul className="mt-1 space-y-2">
                {filledCandidates.map((c, i) => (
                  <li key={i} className="border border-gray-200 rounded p-3">
                    <p className="font-medium">{c.name}</p>
                    {c.profile && (
                      <p className="text-sm text-gray-600 mt-1">{c.profile}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-6 flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => setStep("edit")}
              className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-100"
            >
              修正する
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? "作成中..." : "この内容で作成する"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === Step: Edit ===
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          新しい選挙を作成
        </h1>

        {errors.general && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded p-3 mb-4 text-sm">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleConfirm} className="space-y-6">
          {/* Election Details */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">選挙情報</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                選挙タイトル <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className={INPUT_CLASS}
                placeholder="例：第6区 衆議院予備選挙"
              />
              {errors.title && (
                <p className="text-red-600 text-xs mt-1">{errors.title}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                説明
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={2000}
                rows={3}
                className={`${INPUT_CLASS} resize-vertical`}
                placeholder="選挙の説明（任意）"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                対象選挙区
              </label>
              <select
                value={districtId}
                onChange={(e) => setDistrictId(e.target.value)}
                className={`${INPUT_CLASS} bg-white`}
              >
                <option value="">制限なし（全国）</option>
                <option value="千葉6区">千葉6区（松戸市）</option>
                <option value="千葉1区">千葉1区（千葉市中央区・稲毛区・美浜区）</option>
                <option value="東京1区">東京1区（千代田区・港区・新宿区）</option>
                <option value="東京2区">東京2区（中央区・文京区・台東区）</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  投票開始日時 <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={votingStartAt}
                  onChange={(e) => setVotingStartAt(e.target.value)}
                  className={INPUT_CLASS}
                />
                {errors.votingStartAt && (
                  <p className="text-red-600 text-xs mt-1">
                    {errors.votingStartAt}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  投票終了日時 <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={votingEndAt}
                  onChange={(e) => setVotingEndAt(e.target.value)}
                  className={INPUT_CLASS}
                />
                {errors.votingEndAt && (
                  <p className="text-red-600 text-xs mt-1">
                    {errors.votingEndAt}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allowRevote"
                checked={allowRevote}
                onChange={(e) => setAllowRevote(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="allowRevote" className="text-sm text-gray-700">
                再投票を許可する（最後の投票のみ有効）
              </label>
            </div>
          </div>

          {/* Candidates */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">
                候補者（最低2名）
              </h2>
              <button
                type="button"
                onClick={addCandidate}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
              >
                + 候補者を追加
              </button>
            </div>

            {errors.candidates && (
              <p className="text-red-600 text-xs mb-3">{errors.candidates}</p>
            )}

            <div className="space-y-4">
              {candidates.map((candidate, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">
                      候補者 {index + 1}
                    </span>
                    {candidates.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeCandidate(index)}
                        className="text-red-500 hover:text-red-700 text-sm"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div>
                      <input
                        type="text"
                        value={candidate.name}
                        onChange={(e) =>
                          updateCandidate(index, "name", e.target.value)
                        }
                        maxLength={100}
                        className={INPUT_CLASS}
                        placeholder="候補者名"
                      />
                      {errors.candidateNames?.[index] && (
                        <p className="text-red-600 text-xs mt-1">
                          {errors.candidateNames[index]}
                        </p>
                      )}
                    </div>
                    <textarea
                      value={candidate.profile}
                      onChange={(e) =>
                        updateCandidate(index, "profile", e.target.value)
                      }
                      maxLength={2000}
                      rows={2}
                      className={`${INPUT_CLASS} resize-vertical`}
                      placeholder="プロフィール（任意）"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700"
            >
              確認画面へ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
