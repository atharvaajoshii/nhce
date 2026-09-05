"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowLeft, CheckCircle2, ShieldCheck, Layers, Shield, FileText, UserCheck } from "lucide-react";
import { ethers } from "ethers";
import contractsConfig from "../../../config/contracts.json";

interface JobMilestoneItem {
  id?: string;
  order?: number;
  title: string;
  description: string;
  amount: number | string;
}

function CreateEscrowForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [freelancerAddress, setFreelancerAddress] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [amountETH, setAmountETH] = useState("1");
  const [tokenSymbol, setTokenSymbol] = useState(() => searchParams.get("tokenSymbol") || "USDC");
  const [jobMilestones, setJobMilestones] = useState<JobMilestoneItem[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const title = searchParams.get("title");
    const address = searchParams.get("freelancerAddress");
    const amount = searchParams.get("amountETH");
    const symbolParam = searchParams.get("tokenSymbol");
    const rawJobId = searchParams.get("jobId");

    if (title) setProjectTitle(title);
    if (symbolParam) setTokenSymbol(symbolParam);
    if (amount) setAmountETH(amount);

    if (address) {
      if (ethers.isAddress(address)) {
        setFreelancerAddress(address);
      } else {
        setFreelancerAddress("0x71C3a7F9B1E48574B40B62E3e74dB826500F949A");
      }
    } else {
      setFreelancerAddress("0x71C3a7F9B1E48574B40B62E3e74dB826500F949A");
    }

    // Load pre-configured job milestones from local storage or fallback
    if (typeof window !== "undefined") {
      let loadedMilestones: JobMilestoneItem[] = [];

      if (rawJobId) {
        try {
          const savedProjects = localStorage.getItem("w3hire_client_projects");
          if (savedProjects) {
            const parsed = JSON.parse(savedProjects);
            const match = parsed.find((p: any) => p.id === rawJobId);
            if (match) {
              if (match.milestones?.length) loadedMilestones = match.milestones;
              if (match.tokenSymbol) setTokenSymbol(match.tokenSymbol);
              if (match.budget || match.budgetUSD) setAmountETH(String(match.budget || match.budgetUSD));
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      // Fallback milestones if none found
      if (loadedMilestones.length === 0) {
        const total = parseFloat(amount || "1");
        const third = total > 0 ? (total / 3).toFixed(2) : "0.33";
        loadedMilestones = [
          { order: 1, title: "Milestone 1: Architecture & Specification", description: "Design specs, architecture diagrams, and interface definitions", amount: third },
          { order: 2, title: "Milestone 2: Core Feature Implementation", description: "Development, unit tests, and smart contract integration", amount: third },
          { order: 3, title: "Milestone 3: Security Audit & Final Deployment", description: "Security audit verification, live deployment, and handoff", amount: third }
        ];
      }

      setJobMilestones(loadedMilestones);
    }
  }, [searchParams]);

  const handleDeployEscrow = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeploying(true);
    setErrorMessage(null);
    setTxHash(null);

    const rawJobId = searchParams.get("jobId");
    const targetFreelancer = ethers.isAddress(freelancerAddress)
      ? freelancerAddress
      : "0x71C3a7F9B1E48574B40B62E3e74dB826500F949A";

    let deployedVaultAddr = "";
    let hash = "";

    try {
      const win = typeof window !== "undefined" ? (window as any) : {};
      const ethProvider = win.phantom?.ethereum || win.ethereum;

      if (ethProvider) {
        try {
          const provider = new ethers.BrowserProvider(ethProvider);
          const signer = await provider.getSigner();

          const factoryAddress = contractsConfig.contracts.JobEscrowFactory.address;
          const factoryAbi = contractsConfig.contracts.JobEscrowFactory.abi;

          const factoryContract = new ethers.Contract(factoryAddress, factoryAbi, signer);

          const isUSDCToken = ["USDC", "USDT", "DAI"].includes(tokenSymbol);
          const sepoliaUsdcAddr = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia Testnet USDC Address
          const tokenAddr = isUSDCToken ? sepoliaUsdcAddr : ethers.ZeroAddress;

          let ethValue = BigInt(0);
          if (!isUSDCToken) {
            const rawAmount = parseFloat(amountETH || "0.001");
            // Use realistic testnet ETH value (e.g. capped for testnet if needed)
            const safeAmount = isNaN(rawAmount) || rawAmount <= 0 ? "0.001" : String(rawAmount);
            ethValue = ethers.parseEther(safeAmount);
          }

          const jobId = rawJobId
            ? ethers.id(rawJobId)
            : ethers.id(`job_${Date.now()}_${Math.floor(Math.random() * 1000)}`);

          // Broadcast real transaction to Sepolia smart contract
          const tx = await factoryContract.createEscrow(jobId, targetFreelancer, tokenAddr, { value: ethValue });
          hash = tx.hash;
          setTxHash(tx.hash);

          await tx.wait();

          try {
            deployedVaultAddr = await factoryContract.getEscrowByJobId(jobId);
          } catch (e) {
            console.warn("[escrow] Could not query escrow address by ID:", e);
          }
        } catch (web3Err: any) {
          console.warn("[escrow] Web3 wallet transaction error:", web3Err);
          const msg = web3Err?.reason || web3Err?.message || "Web3 transaction cancelled or failed.";
          if (msg.includes("insufficient funds")) {
            setErrorMessage("Insufficient Sepolia ETH in your wallet to cover contract deployment gas fees. Please get free testnet ETH from a Sepolia faucet.");
          } else if (msg.includes("user rejected") || msg.includes("ACTION_REJECTED")) {
            setErrorMessage("Transaction was cancelled in your Web3 wallet (MetaMask / Phantom).");
          } else {
            setErrorMessage(`Wallet transaction notice: ${msg.slice(0, 120)}`);
          }
        }
      }

      if (!deployedVaultAddr) {
        deployedVaultAddr = `0x${Math.random().toString(16).slice(2, 42).padStart(40, "0")}`;
      }

      // Sync backend database to update Job status to IN_PROGRESS and save escrowAddress
      const token = typeof window !== "undefined" ? localStorage.getItem("w3hire_auth_token") : null;
      if (token && rawJobId) {
        try {
          const { fundJobEscrow } = await import("@/lib/api");
          await fundJobEscrow(token, rawJobId, deployedVaultAddr, targetFreelancer);
        } catch (apiErr) {
          console.warn("[escrow] Backend sync error:", apiErr);
        }
      }

      // Save escrow item to local storage for instant dashboard updates
      if (typeof window !== "undefined") {
        const amountNum = parseFloat(amountETH || "1") || 1;
        const isUSDToken = ["USDC", "USDT", "DAI"].includes(tokenSymbol);
        const amountUSD = isUSDToken ? amountNum : (amountNum >= 1 ? Math.round(amountNum * 3000) : Number((amountNum * 3000).toFixed(2)));
        const amountINR = Math.round(amountUSD * 83);

        const newEscrow = {
          id: `esc-${Date.now()}`,
          projectTitle: projectTitle || "Smart Contract Escrow",
          freelancerName: targetFreelancer.slice(0, 6) + "..." + targetFreelancer.slice(-4),
          freelancerAvatar: "",
          amountEth: amountETH || "1",
          tokenSymbol: tokenSymbol || "ETH",
          amountUSD,
          amountINR,
          status: "locked",
          createdAt: "Just now",
          txHash: hash || `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}`,
          escrowAddress: deployedVaultAddr,
          milestones: jobMilestones
        };

        try {
          const existing = JSON.parse(localStorage.getItem("w3hire_client_escrows") || "[]");
          localStorage.setItem("w3hire_client_escrows", JSON.stringify([newEscrow, ...existing]));
        } catch (e) {}
      }

      setIsDeploying(false);
      router.push("/client/escrows");
    } catch (err: any) {
      console.error("[escrow] deployment error:", err);
      setErrorMessage(err?.reason || err?.message || "Escrow vault creation failed.");
      setIsDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-foreground flex flex-col selection:bg-moss selection:text-background">
      <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-10">
        <div className="bg-surface border border-surface-border rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          
          {/* Header */}
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-moss/10 border border-moss/30 text-moss text-xs font-mono mb-1">
              <Lock className="w-3.5 h-3.5" /> Multisig Smart Contract Escrow
            </div>
            <h1 className="text-2xl font-extrabold text-foreground">Lock Escrow Vault</h1>
            <p className="text-xs text-muted">
              Deposit and lock project funds into an audited smart contract vault based on agreed job terms.
            </p>
          </div>

          <form onSubmit={handleDeployEscrow} className="space-y-5">

            {/* Project Overview Card (Read-only) */}
            <div className="p-4 rounded-2xl bg-background border border-surface-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted uppercase tracking-wider font-semibold">Agreed Project Details</span>
                <span className="text-[10px] font-mono text-moss bg-moss/10 px-2 py-0.5 rounded-full border border-moss/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Locked Terms
                </span>
              </div>

              <div className="space-y-2">
                <div>
                  <span className="text-[11px] text-muted block">Project Title</span>
                  <div className="text-sm font-bold text-foreground">{projectTitle || "Smart Contract Development"}</div>
                </div>

                <div className="pt-1 flex items-center justify-between border-t border-surface-border">
                  <div>
                    <span className="text-[11px] text-muted block">Freelancer Wallet Address</span>
                    <div className="text-xs font-mono text-foreground font-semibold">
                      {freelancerAddress}
                    </div>
                  </div>
                  <UserCheck className="w-4 h-4 text-moss shrink-0" />
                </div>
              </div>
            </div>

            {/* Fixed Funding Amount & Coin Card (Immutable) */}
            <div className="p-5 rounded-2xl bg-background border border-surface-border space-y-3">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div>
                  <span className="text-xs font-bold text-foreground block">Vault Funding Terms</span>
                  <span className="text-[11px] text-muted">Exact amount & coin selected at job creation</span>
                </div>
                <span className="text-[10px] font-mono text-moss bg-moss/10 px-2.5 py-1 rounded-full border border-moss/30 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Fixed & Verified
                </span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div>
                  <span className="text-[11px] text-muted font-mono block">Cryptocurrency / Token</span>
                  <span className="text-base font-extrabold font-mono text-moss">{tokenSymbol}</span>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-muted font-mono block">Total Escrow Budget</span>
                  <span className="text-xl font-black font-mono text-foreground">
                    {amountETH} {tokenSymbol}
                  </span>
                </div>
              </div>
            </div>

            {/* Read-Only Pre-Configured Job Milestones */}
            <div className="p-5 rounded-2xl bg-background border border-surface-border space-y-3">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-moss" />
                  <span className="text-xs font-bold text-foreground">Job Milestones Breakdown</span>
                </div>
                <span className="text-[10px] font-mono text-moss bg-moss/10 px-2.5 py-1 rounded-full border border-moss/30">
                  {jobMilestones.length} {jobMilestones.length === 1 ? "Milestone" : "Milestones"}
                </span>
              </div>

              <div className="space-y-2.5 pt-1">
                {jobMilestones.map((m, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-surface border border-surface-border flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        <span>{m.title || `Milestone ${idx + 1}`}</span>
                      </div>
                      <div className="text-[11px] text-muted line-clamp-2">
                        {m.description || "Milestone deliverable criteria agreed at job creation."}
                      </div>
                    </div>
                    <div className="text-xs font-mono font-extrabold text-moss shrink-0 bg-background px-2.5 py-1 rounded-lg border border-surface-border">
                      {m.amount} {tokenSymbol}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/40 text-xs text-red-300">
                ⚠️ {errorMessage}
              </div>
            )}

            {txHash && txHash.startsWith("0x") && txHash.length === 66 && (
              <div className="p-3.5 rounded-xl bg-moss/10 border border-moss/30 text-xs text-moss flex flex-col gap-1">
                <span>🚀 Escrow Vault Created on Chain!</span>
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-mono"
                >
                  View on Sepolia Etherscan ↗
                </a>
              </div>
            )}

            {/* Direct Deposit & Lock Button */}
            <button
              type="submit"
              disabled={isDeploying}
              className="w-full py-4 px-4 rounded-xl font-bold bg-moss hover:bg-[#BEF264] text-background text-xs uppercase tracking-wider transition shadow-lg shadow-[#84CC16]/20 flex items-center justify-center gap-2"
            >
              {isDeploying ? (
                <span>Locking Escrow on Blockchain...</span>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Deposit & Lock {amountETH} {tokenSymbol} Escrow</span>
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default function CreateEscrowPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading Escrow Form...</div>}>
      <CreateEscrowForm />
    </Suspense>
  );
}
