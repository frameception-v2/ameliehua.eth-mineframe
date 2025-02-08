"use client";

import { useEffect, useCallback, useState } from "react";
import sdk, {
  AddFrame,
  SignIn as SignInCore,
  type Context,
} from "@farcaster/frame-sdk";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "~/components/ui/card";

import { config } from "~/components/providers/WagmiProvider";
import { truncateAddress } from "~/lib/truncateAddress";
import { base, optimism } from "wagmi/chains";
import { useSession } from "next-auth/react";
import { createStore } from "mipd";
import { Label } from "~/components/ui/label";
import { PROJECT_TITLE, BOARD_SIZE, MINE_COUNT } from "~/lib/constants";

type Cell = {
  isMine: boolean;
  isRevealed: boolean;
  adjacentMines: number;
};

function MinesweeperCard() {
  const [board, setBoard] = useState<Cell[][]>(() =>
    Array(BOARD_SIZE).fill(null).map(() => 
      Array(BOARD_SIZE).fill(null).map(() => ({
        isMine: false,
        isRevealed: false,
        adjacentMines: 0
      }))
    )
  );
  const [gameOver, setGameOver] = useState(false);
  
  // Initialize mines
  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const newBoard = [...board];
    // Generate mines
    const generateMines = () => {
      let minesPlaced = 0;
      while (minesPlaced < MINE_COUNT) {
        const x = Math.floor(Math.random() * BOARD_SIZE);
        const y = Math.floor(Math.random() * BOARD_SIZE);
        if (!newBoard[y][x].isMine) {
          newBoard[y][x].isMine = true;
          minesPlaced++;
        }
      }
    };
    
    // Calculate adjacent mines
    const calculateAdjacentMines = () => {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (!newBoard[y][x].isMine) {
            let count = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const ny = y + dy;
                const nx = x + dx;
                if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE) {
                  if (newBoard[ny][nx].isMine) count++;
                }
              }
            }
            newBoard[y][x].adjacentMines = count;
          }
        }
      }
    };
    
    generateMines();
    calculateAdjacentMines();
    setBoard(newBoard);
  }, []);

  const handleCellClick = (y: number, x: number) => {
    if (gameOver || board[y][x].isRevealed) return;
    
    const newBoard = [...board];
    newBoard[y][x].isRevealed = true;
    
    if (newBoard[y][x].isMine) {
      setGameOver(true);
    }
    
    setBoard(newBoard);
  };

  const renderCell = (y: number, x: number) => {
    const cell = board[y][x];
    if (!cell.isRevealed) {
      return (
        <button
          className="w-8 h-8 bg-gray-200 hover:bg-gray-300 border"
          onClick={() => handleCellClick(y, x)}
        />
      );
    }
    return (
      <div className="w-8 h-8 bg-gray-100 border flex items-center justify-center">
        {cell.isMine ? '💣' : cell.adjacentMines || ''}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mineframe Sweeper</CardTitle>
        <CardDescription>
          Find {MINE_COUNT} hidden mines! Click to reveal cells.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-8 gap-1">
          {board.map((row, y) => 
            row.map((_, x) => (
              <div key={`${y}-${x}`}>
                {renderCell(y, x)}
              </div>
            ))
          )}
        </div>
        {gameOver && (
          <div className="mt-4 text-red-600 font-bold">
            Game Over! Mine hit!
          </div>
        )}
        <button 
          className="mt-4 px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          onClick={() => window.location.reload()}
        >
          New Game
        </button>
      </CardContent>
    </Card>
  );
}

export default function Frame() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [context, setContext] = useState<Context.FrameContext>();

  const [added, setAdded] = useState(false);

  const [addFrameResult, setAddFrameResult] = useState("");

  const addFrame = useCallback(async () => {
    try {
      await sdk.actions.addFrame();
    } catch (error) {
      if (error instanceof AddFrame.RejectedByUser) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      if (error instanceof AddFrame.InvalidDomainManifest) {
        setAddFrameResult(`Not added: ${error.message}`);
      }

      setAddFrameResult(`Error: ${error}`);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      const context = await sdk.context;
      if (!context) {
        return;
      }

      setContext(context);
      setAdded(context.client.added);

      // If frame isn't already added, prompt user to add it
      if (!context.client.added) {
        addFrame();
      }

      sdk.on("frameAdded", ({ notificationDetails }) => {
        setAdded(true);
      });

      sdk.on("frameAddRejected", ({ reason }) => {
        console.log("frameAddRejected", reason);
      });

      sdk.on("frameRemoved", () => {
        console.log("frameRemoved");
        setAdded(false);
      });

      sdk.on("notificationsEnabled", ({ notificationDetails }) => {
        console.log("notificationsEnabled", notificationDetails);
      });
      sdk.on("notificationsDisabled", () => {
        console.log("notificationsDisabled");
      });

      sdk.on("primaryButtonClicked", () => {
        console.log("primaryButtonClicked");
      });

      console.log("Calling ready");
      sdk.actions.ready({});

      // Set up a MIPD Store, and request Providers.
      const store = createStore();

      // Subscribe to the MIPD Store.
      store.subscribe((providerDetails) => {
        console.log("PROVIDER DETAILS", providerDetails);
        // => [EIP6963ProviderDetail, EIP6963ProviderDetail, ...]
      });
    };
    if (sdk && !isSDKLoaded) {
      console.log("Calling load");
      setIsSDKLoaded(true);
      load();
      return () => {
        sdk.removeAllListeners();
      };
    }
  }, [isSDKLoaded, addFrame]);

  if (!isSDKLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <div
      style={{
        paddingTop: context?.client.safeAreaInsets?.top ?? 0,
        paddingBottom: context?.client.safeAreaInsets?.bottom ?? 0,
        paddingLeft: context?.client.safeAreaInsets?.left ?? 0,
        paddingRight: context?.client.safeAreaInsets?.right ?? 0,
      }}
    >
      <div className="w-[300px] mx-auto py-2 px-2">
        <h1 className="text-2xl font-bold text-center mb-4 text-gray-700 dark:text-gray-300">
          {PROJECT_TITLE}
        </h1>
        <MinesweeperCard />
      </div>
    </div>
  );
}
