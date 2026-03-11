-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "districtId" TEXT,
    "votingStartAt" DATETIME NOT NULL,
    "votingEndAt" DATETIME NOT NULL,
    "publicKey" TEXT NOT NULL,
    "latestChainHash" TEXT,
    "allowRevote" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profile" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Candidate_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoterRegistry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "subjectHash" TEXT NOT NULL,
    "district" TEXT,
    "hasVoted" BOOLEAN NOT NULL DEFAULT false,
    "latestBallotId" TEXT,
    "voteCount" INTEGER NOT NULL DEFAULT 0,
    "votedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VoterRegistry_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ballot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "encryptedVote" TEXT NOT NULL,
    "ballotTracker" TEXT NOT NULL,
    "hmac" TEXT NOT NULL,
    "previousHash" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ballot_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ElectionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "electionId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "voteCount" INTEGER NOT NULL,
    "finalizedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ElectionResult_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "electionId" TEXT,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VoterRegistry_electionId_subjectHash_key" ON "VoterRegistry"("electionId", "subjectHash");
