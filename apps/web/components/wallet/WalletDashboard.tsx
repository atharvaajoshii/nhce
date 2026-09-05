"use client";

import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { useAuth } from "@/contexts/AuthContext";
import { getAuthToken, fetchMyJobs, fetchMyApplications, Job, JobApplication } from "@/lib/api";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Lock,
  DollarSign,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
  UserCheck
} from "lucide-react";
import Link from "next/link";
import MetaMaskModal from "@/components/metamask-modal";

// JobEscrow ABI snippet for querying status & balances
const JOB_ESCROW_ABI = [
  "function totalFunded() external view returns (uint256)",
  "function totalReleased() external view returns (uint256)",
  "function status() external view returns (uint8)",
  "function freelancer() external view returns (address)",
  "function client() external view returns (address)"
];

interface EscrowActivity {
  id: string;
  jobTitle: string;
  escrowAddress: string;
  role: "CLIENT" | "FREELANCER";
  amountEth: string;
  status: string;
  updatedAt: string;
}

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function WalletDashboard() {
  const { user, disconnectWallet } = useAuth();
  const [balance, setBalance] = useState<string | null>(null);
  const [activeAddress, setActiveAddress] = useState<string | null>(null);
  const [networkName, setNetworkName] = useState<string>("Ethereum Sepolia");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState<boolean>(false);

  // Escrow Metrics
  const [escrowedFunds, setEscrowedFunds] = useState<number>(0);
  const [availableToWithdraw, setAvailableToWithdraw] = useState<number>(0);
  const [totalSpentOrEarned, setTotalSpentOrEarned] = useState<number>(0);
  const [activities, setActivities] = useState<EscrowActivity[]>([]);
  const [loadingMetrics, setLoadingMetrics] = useState<boolean>(true);

  // Fetch Web3 Account & ETH Balance
  const fetchWeb3Balance = useCallback(async () => {
    if (!user?.walletAddress) {
      setActiveAddress(null);
      setBalance(null);
      return;
    }

    if (typeof window === "undefined" || !window.ethereum) {
      setActiveAddress(user.walletAddress);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const currentAddr = user.walletAddress;
      setActiveAddress(currentAddr);

      if (currentAddr) {
        const rawBalance = await provider.getBalance(currentAddr);
        const ethVal = ethers.formatEther(rawBalance);
        setBalance(parseFloat(ethVal).toFixed(4));

        const net = await provider.getNetwork();
        setNetworkName(net.name === "unknown" ? "Sepolia Devnet" : net.name);
      }
    } catch (err) {
      console.error("Failed to read ETH balance:", err);
      setActiveAddress(user.walletAddress || null);
    }
  }, [user?.walletAddress]);

  // Fetch On-Chain Escrow Data from Backend Jobs + Web3 Contracts
  const fetchEscrowMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    const token = getAuthToken();
    let jobsList: Job[] = [];

    try {
      if (token) {
        if (user?.role === "CLIENT") {
          const res = await fetchMyJobs(token);
          jobsList = res.jobs || [];
        } else {
          const res = await fetchMyApplications(token);
          const apps: JobApplication[] = res.applications || [];
          jobsList = apps.map((a) => a.job).filter((j): j is Job => Boolean(j));
        }
      }
    } catch (err) {
      console.warn("Could not fetch user jobs from API:", err);
    }

    let calculatedEscrow = 0;
    let calculatedWithdraw = 0;
    let calculatedSpentEarned = 0;
    const activityList: EscrowActivity[] = [];

    // Setup Web3 provider for on-chain queries
    let provider: ethers.BrowserProvider | ethers.JsonRpcProvider | null = null;
    if (typeof window !== "undefined" && window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum as any);
    }

    for (const job of jobsList) {
      const escrowAddr = job.escrowAddress;
      const budgetNum = job.budget || 0;

      if (escrowAddr && ethers.isAddress(escrowAddr) && provider) {
        try {
          const escrowContract = new ethers.Contract(escrowAddr, JOB_ESCROW_ABI, provider);
          const totalFundedBN = await escrowContract.totalFunded();
          const totalReleasedBN = await escrowContract.totalReleased();

          const totalFundedEth = parseFloat(ethers.formatEther(totalFundedBN)) || budgetNum;
          const totalReleasedEth = parseFloat(ethers.formatEther(totalReleasedBN)) || 0;
          const remainingInVault = Math.max(0, totalFundedEth - totalReleasedEth);

          if (user?.role === "CLIENT") {
            calculatedEscrow += remainingInVault;
            calculatedSpentEarned += totalReleasedEth;
          } else {
            calculatedEscrow += remainingInVault;
            calculatedWithdraw += remainingInVault; // Funds ready in contract for milestone releases
            calculatedSpentEarned += totalReleasedEth;
          }

          activityList.push({
            id: job.id,
            jobTitle: job.title,
            escrowAddress: escrowAddr,
            role: user?.role === "CLIENT" ? "CLIENT" : "FREELANCER",
            amountEth: budgetNum.toFixed(3),
            status: remainingInVault > 0 ? "FUNDS ESCROWED" : "COMPLETED",
            updatedAt: job.updatedAt || new Date().toISOString()
          });
        } catch (err) {
          // Fallback to database numbers if contract query fails
          calculatedEscrow += budgetNum;
          activityList.push({
            id: job.id,
            jobTitle: job.title,
            escrowAddress: escrowAddr,
            role: user?.role === "CLIENT" ? "CLIENT" : "FREELANCER",
            amountEth: budgetNum.toFixed(3),
            status: "ESCROWED",
            updatedAt: job.updatedAt || new Date().toISOString()
          });
        }
      } else if (job.budget) {
        // Unlocked or mock fallback
        if (job.status === "IN_PROGRESS" || job.status === "FREELANCER_SELECTED") {
          calculatedEscrow += budgetNum;
        } else if (job.status === "COMPLETED") {
          calculatedSpentEarned += budgetNum;
        }

        if (escrowAddr) {
          activityList.push({
            id: job.id,
            jobTitle: job.title,
            escrowAddress: escrowAddr,
            role: user?.role === "CLIENT" ? "CLIENT" : "FREELANCER",
            amountEth: budgetNum.toFixed(3),
            status: job.status,
            updatedAt: job.updatedAt || new Date().toISOString()
          });
        }
      }
    }

    // Include local storage payouts (w3hire_freelancer_payouts) for real-time wallet tracking
    if (typeof window !== "undefined") {
      try {
        const savedPayouts = localStorage.getItem("w3hire_freelancer_payouts");
        if (savedPayouts) {
          const payoutsList = JSON.parse(savedPayouts);
          payoutsList.forEach((p: any) => {
            const pAmt = parseFloat(p.amount) || 0;
            calculatedSpentEarned += pAmt;
            activityList.unshift({
              id: p.id || `payout-${Date.now()}`,
              jobTitle: p.jobTitle ? `${p.jobTitle} - ${p.milestoneTitle || 'Milestone'}` : "Milestone Payout Released",
              escrowAddress: p.txHash ? `${p.txHash.slice(0, 6)}...${p.txHash.slice(-4)}` : "0xC65457eC28A9609Ee11AB4A01aa8322E8c571b62",
              role: "FREELANCER",
              amountEth: `${pAmt.toFixed(2)} ${p.tokenSymbol || "USDC"}`,
              status: "PAID TO WALLET",
              updatedAt: p.releasedAt || new Date().toISOString()
            });
          });
        }
      } catch (err) {}
    }

    setEscrowedFunds(calculatedEscrow);
    setAvailableToWithdraw(calculatedWithdraw);
    setTotalSpentOrEarned(calculatedSpentEarned);
    setActivities(activityList);
    setLoadingMetrics(false);
  }, [user?.role]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchWeb3Balance(), fetchEscrowMetrics()]);
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchWeb3Balance();
    fetchEscrowMetrics();

    const handleWalletSync = () => {
      fetchEscrowMetrics();
    };

    window.addEventListener("w3hire_wallet_updated", handleWalletSync);
    window.addEventListener("storage", handleWalletSync);
    return () => {
      window.removeEventListener("w3hire_wallet_updated", handleWalletSync);
      window.removeEventListener("storage", handleWalletSync);
    };
  }, [fetchWeb3Balance, fetchEscrowMetrics]);

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface border border-surface-border p-6 rounded-3xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Web3 Wallet</h1>
            <span className="px-3 py-1 rounded-full text-xs font-mono font-semibold bg-moss/10 text-moss border border-moss/20 uppercase">
              {user?.role === "CLIENT" ? "Client Vault" : "Freelancer Wallet"}
            </span>
          </div>
          <p className="text-xs text-muted font-mono">
            {activeAddress
              ? `Connected: ${activeAddress.slice(0, 6)}...${activeAddress.slice(-4)} (${networkName})`
              : "Connect your Web3 MetaMask wallet to view real-time smart contract balances."}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2.5 rounded-xl bg-background border border-surface-border hover:border-moss/40 text-muted hover:text-foreground transition disabled:opacity-50"
            title="Refresh Balances"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-moss" : ""}`} />
          </button>

          {activeAddress ? (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setActiveAddress(null);
                  setBalance(null);
                  await disconnectWallet();
                }}
                className="px-4 py-2.5 rounded-xl bg-background border border-surface-border hover:border-red-500/40 text-xs font-mono text-muted hover:text-red-400 transition"
              >
                Disconnect Wallet
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsConnectModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-moss hover:bg-[#BEF264] text-background text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 shadow-lg shadow-[#84CC16]/20"
            >
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Available Wallet Balance */}
        <div className="bg-surface border border-surface-border p-6 rounded-2xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted uppercase">Native Balance</span>
            <div className="w-8 h-8 rounded-xl bg-moss/10 flex items-center justify-center text-moss">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold font-mono text-foreground">
              {balance !== null ? `${balance} ETH` : activeAddress ? "Fetching..." : "0.0000 ETH"}
            </div>
            <div className="text-[11px] text-muted font-mono mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-moss" />
              <span>Available in Web3 Wallet</span>
            </div>
          </div>
        </div>

        {/* Card 2: Total Escrowed Funds */}
        <div className="bg-surface border border-surface-border p-6 rounded-2xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted uppercase">Escrowed Funds</span>
            <div className="w-8 h-8 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center text-[#F59E0B]">
              <Lock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold font-mono text-foreground">
              {loadingMetrics ? "Loading..." : `${escrowedFunds.toFixed(3)} ETH`}
            </div>
            <div className="text-[11px] text-muted font-mono mt-1">
              Locked in JobEscrow contracts
            </div>
          </div>
        </div>

        {/* Card 3: Available to Withdraw / Earned */}
        <div className="bg-surface border border-surface-border p-6 rounded-2xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted uppercase">
              {user?.role === "CLIENT" ? "Withdrawable / Refunds" : "Available to Withdraw"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold font-mono text-foreground">
              {loadingMetrics ? "Loading..." : `${availableToWithdraw.toFixed(3)} ETH`}
            </div>
            <div className="text-[11px] text-muted font-mono mt-1">
              Approved milestone payouts ready
            </div>
          </div>
        </div>

        {/* Card 4: Total Spent or Earned */}
        <div className="bg-surface border border-surface-border p-6 rounded-2xl space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted uppercase">
              {user?.role === "CLIENT" ? "Total Payouts Released" : "Total Earnings"}
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold font-mono text-foreground">
              {loadingMetrics ? "Loading..." : `${totalSpentOrEarned.toFixed(3)} ETH`}
            </div>
            <div className="text-[11px] text-muted font-mono mt-1">
              {user?.role === "CLIENT" ? "Completed milestone payments" : "Paid out into your wallet"}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/swap"
          className="p-5 rounded-2xl bg-surface border border-surface-border hover:border-moss/40 transition flex items-center justify-between group"
        >
          <div className="space-y-1">
            <div className="text-sm font-bold text-foreground group-hover:text-moss transition">Instant Token Swap</div>
            <div className="text-xs text-muted">Exchange ETH for platform tokens or ERC20 tokens</div>
          </div>
          <ArrowUpRight className="w-5 h-5 text-muted group-hover:text-moss group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
        </Link>

        {user?.role === "CLIENT" ? (
          <Link
            href="/client/create-escrow"
            className="p-5 rounded-2xl bg-surface border border-surface-border hover:border-moss/40 transition flex items-center justify-between group"
          >
            <div className="space-y-1">
              <div className="text-sm font-bold text-foreground group-hover:text-moss transition">Fund Escrow Vault</div>
              <div className="text-xs text-muted">Deploy a new smart contract vault for a job</div>
            </div>
            <Building2 className="w-5 h-5 text-muted group-hover:text-moss transition-colors" />
          </Link>
        ) : (
          <Link
            href="/projects"
            className="p-5 rounded-2xl bg-surface border border-surface-border hover:border-moss/40 transition flex items-center justify-between group"
          >
            <div className="space-y-1">
              <div className="text-sm font-bold text-foreground group-hover:text-moss transition">Active Contracts</div>
              <div className="text-xs text-muted">Submit deliverables & request milestone releases</div>
            </div>
            <UserCheck className="w-5 h-5 text-muted group-hover:text-moss transition-colors" />
          </Link>
        )}

        <Link
          href="/client/escrows"
          className="p-5 rounded-2xl bg-surface border border-surface-border hover:border-moss/40 transition flex items-center justify-between group"
        >
          <div className="space-y-1">
            <div className="text-sm font-bold text-foreground group-hover:text-moss transition">Smart Escrow Vaults</div>
            <div className="text-xs text-muted">Audit on-chain contracts & Dispute status</div>
          </div>
          <ShieldCheck className="w-5 h-5 text-muted group-hover:text-moss transition-colors" />
        </Link>
      </div>

      {/* On-Chain Activity & Recent Transactions Table */}
      <div className="bg-surface border border-surface-border rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground tracking-tight">Recent Escrow Contracts & Transactions</h3>
            <p className="text-xs text-muted">Verified smart contract vaults associated with your account.</p>
          </div>
          <span className="text-xs font-mono text-muted bg-background border border-surface-border rounded-xl px-3 py-1.5">
            {activities.length} total
          </span>
        </div>

        {loadingMetrics ? (
          <div className="text-center py-12 text-muted font-mono text-xs">
            Loading on-chain transaction history...
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 text-muted space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto text-muted" />
            <p className="text-sm font-bold text-foreground">No smart contract transactions found</p>
            <p className="text-xs">
              {user?.role === "CLIENT"
                ? "Post a job and deploy an escrow vault to see active transactions here."
                : "Submit proposals and accept jobs to start receiving funds into smart escrows."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-surface-border text-muted uppercase">
                  <th className="pb-3 px-2">Job / Project</th>
                  <th className="pb-3 px-2">Role</th>
                  <th className="pb-3 px-2">Amount</th>
                  <th className="pb-3 px-2">Status</th>
                  <th className="pb-3 px-2">Escrow Contract</th>
                  <th className="pb-3 px-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/60">
                {activities.map((act) => (
                  <tr key={act.id} className="hover:bg-background/40 transition">
                    <td className="py-3.5 px-2 font-bold text-foreground">{act.jobTitle}</td>
                    <td className="py-3.5 px-2 text-muted">{act.role}</td>
                    <td className="py-3.5 px-2 font-bold text-moss">{act.amountEth} ETH</td>
                    <td className="py-3.5 px-2">
                      <span className="px-2 py-0.5 rounded bg-moss/10 text-moss border border-moss/20 text-[10px] font-semibold">
                        {act.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-2 font-mono text-muted">
                      {act.escrowAddress.slice(0, 6)}...{act.escrowAddress.slice(-4)}
                    </td>
                    <td className="py-3.5 px-2 text-right">
                      <a
                        href={`https://sepolia.etherscan.io/address/${act.escrowAddress}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-moss hover:underline"
                      >
                        Explorer <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MetaMaskModal
        isOpen={isConnectModalOpen}
        onClose={() => setIsConnectModalOpen(false)}
        role={user?.role === "CLIENT" ? "client" : "freelancer"}
      />
    </div>
  );
}
