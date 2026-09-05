"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowPathIcon,
  ArrowsUpDownIcon,
  BanknotesIcon,
  ShieldCheckIcon,
  SparklesIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTopRightOnSquareIcon,
  WalletIcon
} from "@heroicons/react/24/outline";
import { ethers } from "ethers";
import { useAuth } from "@/contexts/AuthContext";

interface SwapQuoteData {
  tokenIn: string;
  tokenInAddress: string;
  tokenOut: string;
  tokenOutAddress: string;
  amountIn: string;
  expectedAmountOut: string;
  minimumReceived: string;
  slippageTolerance: number;
  priceImpact: string;
  feeTier: number;
  gasEstimate: string;
  routerAddress: string;
  txPayload: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
  isFallbackQuote: boolean;
}

interface WithdrawalPrepareData {
  userWallet: string;
  withdrawalType: "DIRECT" | "SWAP";
  sourceToken: string;
  sourceAmount: string;
  targetToken: string;
  expectedTargetAmount: string;
  minimumReceived?: string;
  slippageTolerance?: number;
  conversionRoute: string;
  txPayload: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
  isFallbackQuote?: boolean;
}

interface TxHistoryItem {
  hash: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  timestamp: string;
  blockNumber?: number;
}

const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111
const SEPOLIA_CHAIN_ID_DEC = 11155111;

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export default function SwapPage() {
  const { user } = useAuth();

  // Mode: "SWAP" or "WITHDRAW"
  const [activeTab, setActiveTab] = useState<"SWAP" | "WITHDRAW">("SWAP");

  // Web3 Wallet State
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [ethBalance, setEthBalance] = useState<string>("0.00");
  const [isWalletConnected, setIsWalletConnected] = useState(false);

  // Swap Form State
  const [tokenIn, setTokenIn] = useState("ETH");
  const [tokenOut, setTokenOut] = useState("USDC");
  const [amountIn, setAmountIn] = useState("0.01");
  const [slippage, setSlippage] = useState(0.5);

  // Withdrawal State
  const [withdrawWallet, setWithdrawWallet] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("0.01");
  const [sourceToken, setSourceToken] = useState("ETH");
  const [targetToken, setTargetToken] = useState("USDC");

  // API Call & Tx Execution States
  const [loading, setLoading] = useState(false);
  const [txStep, setTxStep] = useState<"idle" | "connecting" | "approving" | "signing" | "mining" | "success" | "error">("idle");
  const [quoteData, setQuoteData] = useState<SwapQuoteData | null>(null);
  const [withdrawalData, setWithdrawalData] = useState<WithdrawalPrepareData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [activeTxHash, setActiveTxHash] = useState<string | null>(null);
  const [txHistory, setTxHistory] = useState<TxHistoryItem[]>([]);

  const tokens = [
    { symbol: "ETH", name: "Ethereum (Native)", icon: "Ξ", address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14" },
    { symbol: "WETH", name: "Wrapped Ether", icon: "⟠", address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14" },
    { symbol: "USDC", name: "USD Coin", icon: "$", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" },
    { symbol: "USDT", name: "Tether USD", icon: "₮", address: "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0" },
  ];

  // Helper to get Ethereum Provider from window
  const getEthereumProvider = () => {
    if (typeof window === "undefined") return null;
    const win = window as any;
    return win.phantom?.ethereum || win.ethereum || null;
  };

  // Connect Web3 Wallet & Fetch Sepolia Balance
  const connectWallet = useCallback(async () => {
    const provider = getEthereumProvider();
    if (!provider) {
      setErrorMsg("No Web3 wallet (MetaMask) detected. Please install MetaMask to execute live swaps.");
      return null;
    }

    try {
      setTxStep("connecting");
      const browserProvider = new ethers.BrowserProvider(provider);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const network = await browserProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      if (accounts && accounts.length > 0) {
        const addr = accounts[0];
        setWalletAddress(addr);
        setWithdrawWallet(addr);
        setChainId(currentChainId);
        setIsWalletConnected(true);

        const bal = await browserProvider.getBalance(addr);
        setEthBalance(parseFloat(ethers.formatEther(bal)).toFixed(4));
        setTxStep("idle");
        return { addr, chainId: currentChainId, browserProvider };
      }
    } catch (err: any) {
      console.error("Wallet connection error:", err);
      setErrorMsg(err.message || "Failed to connect MetaMask wallet.");
      setTxStep("idle");
    }
    return null;
  }, []);

  // Switch Network to Sepolia Testnet
  const switchToSepolia = async () => {
    const provider = getEthereumProvider();
    if (!provider) return false;

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
      setChainId(SEPOLIA_CHAIN_ID_DEC);
      setErrorMsg("");
      return true;
    } catch (switchError: any) {
      // Unrecognized chain id error (4902)
      if (switchError.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID_HEX,
                chainName: "Sepolia Test Network",
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
          setChainId(SEPOLIA_CHAIN_ID_DEC);
          return true;
        } catch (addError: any) {
          setErrorMsg("Could not add Sepolia network to MetaMask.");
          return false;
        }
      }
      setErrorMsg("Please switch your wallet network to Sepolia Testnet to proceed.");
      return false;
    }
  };

  // Sync wallet on mount
  useEffect(() => {
    if (user?.walletAddress) {
      setWithdrawWallet(user.walletAddress);
    }

    const provider = getEthereumProvider();
    if (provider) {
      const checkCurrentConn = async () => {
        try {
          const browserProvider = new ethers.BrowserProvider(provider);
          const accounts = await browserProvider.send("eth_accounts", []);
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            setIsWalletConnected(true);
            const net = await browserProvider.getNetwork();
            setChainId(Number(net.chainId));
            const bal = await browserProvider.getBalance(accounts[0]);
            setEthBalance(parseFloat(ethers.formatEther(bal)).toFixed(4));
          }
        } catch (e) {
          console.warn("Auto connect check skipped:", e);
        }
      };
      checkCurrentConn();

      // Setup window.ethereum listeners
      const handleAccountsChanged = (accs: string[]) => {
        if (accs.length > 0) {
          setWalletAddress(accs[0]);
          setIsWalletConnected(true);
        } else {
          setWalletAddress("");
          setIsWalletConnected(false);
        }
      };
      const handleChainChanged = (hexChainId: string) => {
        setChainId(parseInt(hexChainId, 16));
      };

      if (provider.on) {
        provider.on("accountsChanged", handleAccountsChanged);
        provider.on("chainChanged", handleChainChanged);
      }
    }
  }, [user]);

  // Fetch Swap Quote from Backend
  const handleFetchQuote = useCallback(async () => {
    if (!amountIn || parseFloat(amountIn) <= 0) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const queryParams = new URLSearchParams({
        tokenIn,
        tokenOut,
        amountIn,
        slippageTolerance: slippage.toString(),
        recipient: walletAddress || withdrawWallet || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
      });

      const res = await fetch(`http://localhost:3001/api/swap/quote?${queryParams}`);
      const data = await res.json();

      if (data.success) {
        setQuoteData(data.data);
      } else {
        setErrorMsg(data.message || "Failed to fetch swap quote");
      }
    } catch (err: any) {
      console.warn("API offline fallback preview mode:", err);
      const fallbackRate = tokenIn === "ETH" || tokenIn === "WETH" ? 2600.0 : 1.0;
      const expectedOut = (parseFloat(amountIn || "1.0") * fallbackRate).toFixed(tokenOut === "ETH" ? 4 : 2);
      const minOut = (parseFloat(expectedOut) * (1 - slippage / 100)).toFixed(tokenOut === "ETH" ? 4 : 2);

      setQuoteData({
        tokenIn,
        tokenInAddress: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
        tokenOut,
        tokenOutAddress: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        amountIn,
        expectedAmountOut: expectedOut,
        minimumReceived: minOut,
        slippageTolerance: slippage,
        priceImpact: "< 0.01%",
        feeTier: 3000,
        gasEstimate: "150000",
        routerAddress: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
        txPayload: {
          to: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
          data: "0x04e45aaf000000000000000000000000fff9976782d46cc05630d1f6ebab18b2324d6b14...",
          value: tokenIn === "ETH" ? ethers.parseEther(amountIn).toString() : "0",
          gasLimit: "210000"
        },
        isFallbackQuote: true
      });
    } finally {
      setLoading(false);
    }
  }, [amountIn, tokenIn, tokenOut, slippage, walletAddress, withdrawWallet]);

  // Fetch Withdrawal Preparation from Backend
  const handlePrepareWithdrawal = useCallback(async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) return;
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("http://localhost:3001/api/withdrawal/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userWallet: withdrawWallet || walletAddress || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
          sourceAmount: withdrawAmount,
          sourceToken,
          requestedTargetToken: targetToken,
          slippageTolerance: slippage
        })
      });

      const data = await res.json();
      if (data.success) {
        setWithdrawalData(data.data);
      } else {
        setErrorMsg(data.message || "Failed to prepare withdrawal");
      }
    } catch (err: any) {
      console.warn("API offline withdrawal fallback mode:", err);
      const isSame = sourceToken === targetToken;
      setWithdrawalData({
        userWallet: withdrawWallet || walletAddress,
        withdrawalType: isSame ? "DIRECT" : "SWAP",
        sourceToken,
        sourceAmount: withdrawAmount,
        targetToken,
        expectedTargetAmount: isSame ? withdrawAmount : (parseFloat(withdrawAmount) * 2600.0).toFixed(2),
        minimumReceived: isSame ? withdrawAmount : (parseFloat(withdrawAmount) * 2587.0).toFixed(2),
        slippageTolerance: slippage,
        conversionRoute: isSame ? "DIRECT_TRANSFER" : "UNISWAP_V3_SWAP",
        txPayload: {
          to: isSame ? withdrawWallet : "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
          data: isSame ? "0x" : "0x04e45aaf0000000000...",
          value: sourceToken === "ETH" ? ethers.parseEther(withdrawAmount).toString() : "0",
          gasLimit: isSame ? "21000" : "210000"
        },
        isFallbackQuote: true
      });
    } finally {
      setLoading(false);
    }
  }, [withdrawAmount, sourceToken, targetToken, withdrawWallet, walletAddress, slippage]);

  // Auto trigger quote on parameter changes
  useEffect(() => {
    if (activeTab === "SWAP") {
      handleFetchQuote();
    } else {
      handlePrepareWithdrawal();
    }
  }, [activeTab, tokenIn, tokenOut, amountIn, sourceToken, targetToken, withdrawAmount, slippage, handleFetchQuote, handlePrepareWithdrawal]);

  const handleInvertTokens = () => {
    const temp = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(temp);
  };

  // Main Live On-Chain Web3 Transaction Execution
  const handleExecuteTx = async () => {
    setErrorMsg("");
    setStatusMsg("");
    setActiveTxHash(null);

    const ethProvider = getEthereumProvider();
    if (!ethProvider) {
      setErrorMsg("MetaMask wallet is not installed. Please install MetaMask to execute on-chain swaps.");
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(ethProvider);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        setErrorMsg("Please unlock and connect your Web3 wallet.");
        return;
      }

      const activeUserAddr = accounts[0];
      setWalletAddress(activeUserAddr);
      setIsWalletConnected(true);

      // Verify Sepolia Network
      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== SEPOLIA_CHAIN_ID_DEC) {
        setStatusMsg("Switching wallet network to Sepolia Testnet...");
        const switched = await switchToSepolia();
        if (!switched) return;
      }

      const signer = await browserProvider.getSigner();

      // Get target payload
      const payload = activeTab === "SWAP" ? quoteData?.txPayload : withdrawalData?.txPayload;
      if (!payload || !payload.to) {
        setErrorMsg("Invalid transaction payload. Please recalculate quote.");
        return;
      }

      const activeSourceToken = activeTab === "SWAP" ? tokenIn : sourceToken;
      const targetTokenSymbol = activeTab === "SWAP" ? tokenOut : targetToken;
      const activeAmount = activeTab === "SWAP" ? amountIn : withdrawAmount;

      // Handle ERC-20 Token Approvals if Token In is NOT native ETH
      if (activeSourceToken !== "ETH") {
        const tokenObj = tokens.find((t) => t.symbol === activeSourceToken);
        const tokenAddress = quoteData?.tokenInAddress || tokenObj?.address;

        if (tokenAddress && ethers.isAddress(tokenAddress)) {
          setTxStep("approving");
          setStatusMsg(`Checking ERC-20 approval allowance for ${activeSourceToken}...`);

          const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
          const decimals = activeSourceToken === "USDC" || activeSourceToken === "USDT" ? 6 : 18;
          const requiredAmountWei = ethers.parseUnits(activeAmount || "0.01", decimals);
          
          try {
            const currentAllowance = await tokenContract.allowance(activeUserAddr, payload.to);
            if (currentAllowance < requiredAmountWei) {
              setStatusMsg(`Requesting ${activeSourceToken} Token Approval in MetaMask...`);
              const approveTx = await tokenContract.approve(payload.to, ethers.MaxUint256);
              setStatusMsg(`Mining ${activeSourceToken} Approval transaction on Sepolia... (Tx: ${approveTx.hash.slice(0, 10)}...)`);
              await approveTx.wait();
              setStatusMsg(`Token Approval confirmed! Proceeding with swap...`);
            }
          } catch (approveErr: any) {
            console.warn("Approval check / execution notice:", approveErr);
          }
        }
      }

      // Dispatch Swap Transaction Payload to MetaMask
      setTxStep("signing");
      setStatusMsg("Please confirm transaction prompt in MetaMask wallet...");

      const txParams: any = {
        to: payload.to,
        data: payload.data && payload.data.startsWith("0x") ? payload.data : "0x",
        value: payload.value ? BigInt(payload.value) : BigInt(0),
      };

      if (payload.gasLimit && payload.gasLimit !== "0") {
        txParams.gasLimit = BigInt(payload.gasLimit);
      }

      const txResponse = await signer.sendTransaction(txParams);

      // Set Mining State
      setTxStep("mining");
      setActiveTxHash(txResponse.hash);
      setStatusMsg(`Transaction submitted to Sepolia Testnet! Mining block confirmation...`);

      // Wait for block verification
      const receipt = await txResponse.wait();
      setTxStep("success");

      const successNotice = `✅ Swap Successfully Executed on Sepolia Testnet! Confirmed in Block #${receipt?.blockNumber || "latest"}.`;
      setStatusMsg(successNotice);

      // Add to transaction history
      const newHistoryItem: TxHistoryItem = {
        hash: txResponse.hash,
        tokenIn: activeSourceToken,
        tokenOut: targetTokenSymbol,
        amountIn: activeAmount,
        amountOut: activeTab === "SWAP" ? (quoteData?.expectedAmountOut || "0.00") : (withdrawalData?.expectedTargetAmount || "0.00"),
        timestamp: new Date().toLocaleTimeString(),
        blockNumber: receipt?.blockNumber
      };

      setTxHistory((prev) => [newHistoryItem, ...prev.slice(0, 4)]);

      // Refresh ETH balance
      const freshBal = await browserProvider.getBalance(activeUserAddr);
      setEthBalance(parseFloat(ethers.formatEther(freshBal)).toFixed(4));

    } catch (err: any) {
      console.error("Execute Tx Error:", err);
      setTxStep("error");

      if (err.code === 4001 || err.message?.includes("user rejected")) {
        setErrorMsg("Transaction cancelled by user in MetaMask.");
      } else {
        setErrorMsg(err.reason || err.message || "On-chain transaction execution reverted or failed.");
      }
    }
  };

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 space-y-8">
      {/* Header & Wallet Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full bg-moss/10 text-moss text-xs font-mono font-bold border border-moss/20">
              SEPOLIA DEVNET (CHAIN 11155111)
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-surface text-muted text-xs font-mono border border-surface-border">
              UNISWAP V3 SMART ROUTER
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Currency Swap & Withdrawal
          </h1>
          <p className="text-muted text-sm mt-1">
            Live on-chain token exchange and automated multi-currency withdrawal pipeline powered by Uniswap V3 on Sepolia.
          </p>
        </div>

        {/* Wallet Connection Status / Trigger */}
        <div className="flex items-center gap-3">
          {isWalletConnected ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface border border-surface-border text-xs font-mono">
              <span className="w-2.5 h-2.5 rounded-full bg-moss animate-pulse" />
              <span className="text-foreground font-semibold">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
              <span className="text-muted border-l border-surface-border pl-2">
                {ethBalance} ETH
              </span>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface hover:bg-surface-hover border border-moss/40 text-moss text-xs font-bold font-mono transition shadow-md"
            >
              <WalletIcon className="w-4 h-4" />
              <span>Connect Wallet</span>
            </button>
          )}

          {/* Mode Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-surface border border-surface-border">
            <button
              onClick={() => setActiveTab("SWAP")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "SWAP"
                  ? "bg-moss text-background shadow-md"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <ArrowsUpDownIcon className="w-4 h-4" />
              <span>DEX Swap</span>
            </button>
            <button
              onClick={() => setActiveTab("WITHDRAW")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === "WITHDRAW"
                  ? "bg-moss text-background shadow-md"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <BanknotesIcon className="w-4 h-4" />
              <span>Auto Withdrawal</span>
            </button>
          </div>
        </div>
      </div>

      {/* Network Warning Banner if not on Sepolia */}
      {chainId && chainId !== SEPOLIA_CHAIN_ID_DEC && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-300 text-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <span>
              Your connected wallet is on Chain ID <strong className="font-mono">{chainId}</strong>. Swaps require <strong>Sepolia Testnet (Chain ID 11155111)</strong>.
            </span>
          </div>
          <button
            onClick={switchToSepolia}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold font-mono text-[11px] hover:bg-amber-400 transition"
          >
            Switch to Sepolia
          </button>
        </div>
      )}

      {/* Main Card Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Interactive Swap / Withdrawal Form */}
        <div className="lg:col-span-7 bg-surface border border-surface-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-moss/5 rounded-full blur-3xl pointer-events-none" />

          {activeTab === "SWAP" ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted tracking-wider font-semibold">
                  Swap Tokens
                </span>
                {/* Slippage Selector */}
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-muted">Slippage:</span>
                  {[0.1, 0.5, 1.0].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlippage(s)}
                      className={`px-2 py-0.5 rounded-md font-mono text-[11px] border transition ${
                        slippage === s
                          ? "bg-moss/20 text-moss border-moss/40"
                          : "bg-background border-surface-border text-muted hover:text-foreground"
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Token In Box */}
              <div className="p-4 rounded-2xl bg-background border border-surface-border space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>You Pay</span>
                  <span>Balance: {tokenIn === "ETH" ? `${ethBalance} ETH` : "Available"}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <input
                    type="number"
                    value={amountIn}
                    onChange={(e) => setAmountIn(e.target.value)}
                    placeholder="0.0"
                    step="0.001"
                    className="w-full bg-transparent text-2xl sm:text-3xl font-bold font-mono text-foreground focus:outline-none"
                  />
                  <select
                    value={tokenIn}
                    onChange={(e) => setTokenIn(e.target.value)}
                    className="bg-surface hover:bg-surface-hover border border-surface-border text-foreground font-mono font-bold text-sm rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                  >
                    {tokens.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.icon} {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Invert Button */}
              <div className="flex justify-center -my-3 relative z-10">
                <button
                  onClick={handleInvertTokens}
                  className="p-2.5 rounded-2xl bg-surface hover:bg-surface-hover border border-surface-border text-moss hover:rotate-180 transition-all duration-300 shadow-md"
                  title="Invert Token Pair"
                >
                  <ArrowsUpDownIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Token Out Box */}
              <div className="p-4 rounded-2xl bg-background border border-surface-border space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>You Receive (Estimated)</span>
                  <span>Fee Tier: 0.3%</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="w-full text-2xl sm:text-3xl font-bold font-mono text-moss">
                    {loading ? (
                      <span className="text-muted animate-pulse">Calculating...</span>
                    ) : (
                      quoteData?.expectedAmountOut || "0.00"
                    )}
                  </div>
                  <select
                    value={tokenOut}
                    onChange={(e) => setTokenOut(e.target.value)}
                    className="bg-surface hover:bg-surface-hover border border-surface-border text-foreground font-mono font-bold text-sm rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                  >
                    {tokens.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.icon} {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Withdrawal Mode */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase text-muted tracking-wider font-semibold">
                  Auto-Conversion Withdrawal
                </span>
                <span className="px-2 py-0.5 rounded-md bg-moss/10 text-moss text-[11px] font-mono border border-moss/20">
                  Direct or Swap Route
                </span>
              </div>

              {/* User Target Wallet */}
              <div className="p-4 rounded-2xl bg-background border border-surface-border space-y-2">
                <label className="text-xs text-muted block">Target User Wallet Address</label>
                <input
                  type="text"
                  value={withdrawWallet}
                  onChange={(e) => setWithdrawWallet(e.target.value)}
                  placeholder="0x..."
                  className="w-full bg-transparent text-sm font-mono text-foreground focus:outline-none border-b border-surface-border pb-1"
                />
              </div>

              {/* Source Token & Amount */}
              <div className="p-4 rounded-2xl bg-background border border-surface-border space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Source Escrow Balance</span>
                  <span>Amount to Withdraw</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.0"
                    step="0.001"
                    className="w-full bg-transparent text-2xl font-bold font-mono text-foreground focus:outline-none"
                  />
                  <select
                    value={sourceToken}
                    onChange={(e) => setSourceToken(e.target.value)}
                    className="bg-surface hover:bg-surface-hover border border-surface-border text-foreground font-mono font-bold text-sm rounded-xl px-3 py-2 focus:outline-none cursor-pointer"
                  >
                    {tokens.map((t) => (
                      <option key={t.symbol} value={t.symbol}>
                        {t.icon} {t.symbol}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Requested Target Token */}
              <div className="p-4 rounded-2xl bg-background border border-surface-border space-y-2">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Preferred Target Currency</span>
                  <span>Auto-Conversion Mode</span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-1">
                  {["ETH", "USDC", "USDT"].map((tok) => (
                    <button
                      key={tok}
                      onClick={() => setTargetToken(tok)}
                      className={`p-3 rounded-xl border text-xs font-mono font-bold flex flex-col items-center gap-1 transition ${
                        targetToken === tok
                          ? "bg-moss/20 text-moss border-moss/50 shadow-md"
                          : "bg-surface border-surface-border text-muted hover:text-foreground"
                      }`}
                    >
                      <span className="text-base">{tok === "ETH" ? "Ξ" : tok === "USDC" ? "$" : "₮"}</span>
                      <span>{tok}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Error & Status Messages */}
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 rounded-xl bg-moss/10 border border-moss/30 text-moss text-xs space-y-1">
              <div className="flex items-center gap-2">
                {txStep === "mining" || txStep === "approving" || txStep === "signing" ? (
                  <ArrowPathIcon className="w-4 h-4 flex-shrink-0 animate-spin text-moss" />
                ) : (
                  <CheckCircleIcon className="w-4 h-4 flex-shrink-0 text-moss" />
                )}
                <span className="font-mono text-[11px] leading-tight">{statusMsg}</span>
              </div>

              {activeTxHash && (
                <div className="pt-1 flex items-center justify-between border-t border-moss/20 text-[11px]">
                  <span className="text-muted">Sepolia Tx Hash:</span>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${activeTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-bold text-moss underline flex items-center gap-1 hover:text-white"
                  >
                    <span>{activeTxHash.slice(0, 10)}...{activeTxHash.slice(-6)}</span>
                    <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Primary On-Chain Execution Button */}
          <button
            onClick={handleExecuteTx}
            disabled={loading || txStep === "approving" || txStep === "signing" || txStep === "mining"}
            className="w-full py-4 rounded-2xl bg-moss hover:bg-[#BEF264] text-background font-bold text-sm transition-all shadow-xl shadow-moss/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {txStep === "approving" ? (
              <>
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                <span>Approving ERC-20 Allowance...</span>
              </>
            ) : txStep === "signing" ? (
              <>
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                <span>Confirming in MetaMask...</span>
              </>
            ) : txStep === "mining" ? (
              <>
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                <span>Mining Tx on Sepolia...</span>
              </>
            ) : loading ? (
              <>
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                <span>Computing Sepolia Route...</span>
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                <span>{activeTab === "SWAP" ? "Execute Swap on Sepolia Testnet" : "Prepare Conversion & Withdraw"}</span>
              </>
            )}
          </button>
        </div>

        {/* Right Column: Execution Breakdown & Payload Summary */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-surface border border-surface-border rounded-3xl p-6 space-y-5 shadow-2xl">
            <h3 className="text-sm font-mono uppercase text-foreground font-bold tracking-wider flex items-center gap-2">
              <ShieldCheckIcon className="w-4 h-4 text-moss" />
              <span>Execution Breakdown</span>
            </h3>

            {activeTab === "SWAP" ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Exchange Pair</span>
                  <span className="font-mono font-bold text-foreground">{tokenIn} → {tokenOut}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Expected Output</span>
                  <span className="font-mono font-bold text-moss">{quoteData?.expectedAmountOut || "0.00"} {tokenOut}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Minimum Received ({slippage}%)</span>
                  <span className="font-mono text-foreground">{quoteData?.minimumReceived || "0.00"} {tokenOut}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Price Impact</span>
                  <span className="font-mono text-moss">{quoteData?.priceImpact || "< 0.01%"}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Est. Gas Limit</span>
                  <span className="font-mono text-foreground">{quoteData?.gasEstimate || "210000"} gas</span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">SwapRouter Address</span>
                  <span className="font-mono text-[11px] text-muted truncate max-w-[150px]">{quoteData?.routerAddress || "0x3bFA...e48E"}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Withdrawal Type</span>
                  <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                    withdrawalData?.withdrawalType === "DIRECT"
                      ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      : "bg-moss/10 text-moss border border-moss/20"
                  }`}>
                    {withdrawalData?.withdrawalType || (sourceToken === targetToken ? "DIRECT" : "SWAP")}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Source Amount</span>
                  <span className="font-mono font-bold text-foreground">{withdrawAmount} {sourceToken}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Expected Target Output</span>
                  <span className="font-mono font-bold text-moss">
                    {withdrawalData?.expectedTargetAmount || withdrawAmount} {targetToken}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-surface-border">
                  <span className="text-muted">Conversion Route</span>
                  <span className="font-mono text-foreground">{withdrawalData?.conversionRoute || "DIRECT_TRANSFER"}</span>
                </div>
              </div>
            )}

            {/* Testnet & Faucet Verification Guidance */}
            <div className="p-4 rounded-2xl bg-background border border-surface-border text-[11px] text-muted space-y-2">
              <div className="flex items-center gap-1.5 text-foreground font-semibold">
                <InformationCircleIcon className="w-4 h-4 text-moss" />
                <span>Sepolia Testnet Verification</span>
              </div>
              <p className="leading-relaxed">
                All transactions dispatch live to Sepolia Testnet (Chain ID 11155111) via MetaMask. You can inspect all executed swaps directly on Sepolia Etherscan.
              </p>
              <div className="pt-2 border-t border-surface-border flex flex-col gap-1">
                <span className="text-[10px] text-muted uppercase font-mono font-bold">Free Sepolia Faucets:</span>
                <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                  <a
                    href="https://sepoliafaucet.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-moss hover:underline flex items-center gap-1"
                  >
                    Alchemy Faucet <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                  <a
                    href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
                    target="_blank"
                    rel="noreferrer"
                    className="text-moss hover:underline flex items-center gap-1"
                  >
                    Google Cloud Faucet <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Session Swap Verification Log */}
          {txHistory.length > 0 && (
            <div className="bg-surface border border-surface-border rounded-3xl p-6 space-y-3 shadow-2xl">
              <span className="text-xs font-mono uppercase text-foreground font-bold tracking-wider block">
                Verified On-Chain Swaps
              </span>
              <div className="space-y-2">
                {txHistory.map((item) => (
                  <div key={item.hash} className="p-3 rounded-xl bg-background border border-surface-border text-xs flex items-center justify-between font-mono">
                    <div>
                      <div className="text-foreground font-bold">
                        {item.amountIn} {item.tokenIn} → {item.amountOut} {item.tokenOut}
                      </div>
                      <div className="text-[10px] text-muted">
                        Block #{item.blockNumber || "Pending"} • {item.timestamp}
                      </div>
                    </div>
                    <a
                      href={`https://sepolia.etherscan.io/tx/${item.hash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-moss/10 hover:bg-moss/20 text-moss text-[11px] border border-moss/30 flex items-center gap-1"
                    >
                      <span>Verify</span>
                      <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payload Preview */}
          <div className="bg-surface border border-surface-border rounded-3xl p-6 space-y-3 shadow-2xl">
            <span className="text-xs font-mono uppercase text-muted font-semibold block">
              Constructed Calldata Payload
            </span>
            <pre className="p-3 rounded-xl bg-background border border-surface-border text-[10px] font-mono text-moss overflow-x-auto max-h-36">
              {JSON.stringify(
                activeTab === "SWAP" ? quoteData?.txPayload : withdrawalData?.txPayload,
                null,
                2
              ) || "// Calldata will render here..."}
            </pre>
          </div>
        </div>

      </div>
    </main>
  );
}
