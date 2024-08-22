import { assign, EventObject, fromCallback, setup } from "xstate";

type SquareColor = "light" | "dark";

type TrialOutcome = "hit" | "falseAlarm" | "correctRejection" | "miss";

type RoundData = Record<
  number,
  {
    piecePositionForRound: string;
    trials: Array<{
      stimulus: string;
      isTarget: boolean;
      userResponse?: "match";
      outcome?: TrialOutcome;
    }>;
  }
>;

interface GameContext {
  currentSquare?: string;
  score: number;
  piecePositionForRound: string;
  guessesRemainingInRound: number;
  voiceEnabled: boolean;
  countdown: number;
  currentGuess?: SquareColor;
  incorrectCount: number;
  positionsForRound: string[];
  currentRound: number;
  accuracyScore?: number;
  roundData: RoundData;
}

type GameEvent =
  | { type: "start" }
  | { type: "userResponse"; userResponse: "match" }
  | { type: "tick" }
  | { type: "restart" }
  | { type: "voice.toggle" };

function generateSquareColors(): Record<string, SquareColor> {
  const files = "abcdefgh";
  const ranks = "12345678";
  const squareColors: Record<string, SquareColor> = {};

  for (const file of files) {
    for (const rank of ranks) {
      const squareName = `${file}${rank}`;
      const fileIndex = files.indexOf(file);
      const rankIndex = ranks.indexOf(rank);

      // If the sum of file index and rank index is odd, the square is light
      squareColors[squareName] =
        (fileIndex + rankIndex) % 2 === 0 ? "dark" : "light";
    }
  }
  return squareColors;
}

const squareColors = generateSquareColors();

function getSquareColor(square: string): SquareColor {
  return squareColors[square];
}

const getRandomSquare = (): string => {
  const squares = Object.keys(squareColors);
  return squares[Math.floor(Math.random() * squares.length)];
};

export const NUMBER_OF_ROUNDS = 4;
export const TRIALS_PER_ROUND = 5;

export const gameMachine = setup({
  types: {} as {
    context: GameContext;
    events: GameEvent;
  },
  actions: {
    announceSquare: ({ context }) => {
      if (context.voiceEnabled && context.currentSquare) {
        const utterance = new SpeechSynthesisUtterance(
          context.currentSquare.replace("a", "ae")
        );
        window.speechSynthesis.speak(utterance);
      }
    },
    announcePiecePosition: ({ context }) => {
      if (context.voiceEnabled && context.piecePositionForRound) {
        const utterance = new SpeechSynthesisUtterance(
          "knight " + context.piecePositionForRound.replace("a", "ae")
        );
        window.speechSynthesis.speak(utterance);
      }
    },
    decrementCountdown: assign({
      countdown: ({ context }) => context.countdown - 1,
    }),
    initialiseCountdown: assign({
      countdown: 3,
    }),
    initialiseNextRound: assign(({ context }) => {
      const piecePositionForRound = getRandomSquare();
      const { positions } = generatePositionsForRound(
        "knight",
        piecePositionForRound,
        TRIALS_PER_ROUND
      );
      return {
        ...context,
        piecePositionForRound,
        guessesRemainingInRound: TRIALS_PER_ROUND,
        positionsForRound: positions,
        currentRound: context.currentRound + 1,
        roundData: {
          ...context.roundData,
          [context.currentRound + 1]: {
            trials: positions.map((stimulus) => ({
              stimulus,
              isTarget: isReachable("knight", piecePositionForRound, stimulus),
            })),
            piecePositionForRound,
          },
        },
      };
    }),
    decrementGuessesRemainingInRound: assign({
      guessesRemainingInRound: ({ context }) =>
        context.guessesRemainingInRound - 1,
    }),
    setupNextTrial: assign({
      currentSquare: ({ context }) => {
        return context.positionsForRound[
          TRIALS_PER_ROUND - context.guessesRemainingInRound
        ];
      },
    }),
    clearCurrentGuess: assign({
      currentGuess: undefined,
    }),
    saveUserResponse: assign({
      roundData: ({ context }, params: { userResponse: "match" }) => {
        console.log(context.roundData, context.currentRound);
        const currentRoundData = context.roundData[context.currentRound];
        const currentTrial =
          currentRoundData.trials[
            TRIALS_PER_ROUND - context.guessesRemainingInRound
          ];
        return {
          ...context.roundData,
          [context.currentRound]: {
            ...currentRoundData,
            trials: [
              ...currentRoundData.trials,
              {
                ...currentTrial,
                userResponse: params.userResponse,
              },
            ],
          },
        };
      },
    }),
    calculateAccuracyScore: assign({
      accuracyScore: ({ context }) => {
        return calculateAccuracyScore(context.roundData);
      },
    }),

    trackIncorrectGuess: assign({
      incorrectCount: ({ context }) => context.incorrectCount + 1,
    }),
    evaluateGuess: assign({
      roundData: ({ context }) => {
        console.log(context.roundData, context.currentRound);
        const currentRoundData = context.roundData[context.currentRound];
        const currentTrial =
          currentRoundData.trials[
            TRIALS_PER_ROUND - context.guessesRemainingInRound
          ];

        const isTarget = isReachable(
          "knight",
          currentRoundData.piecePositionForRound,
          currentTrial.stimulus
        );

        let outcome: TrialOutcome = "miss";
        if (isTarget && currentTrial.userResponse === "match") {
          outcome = "hit";
        } else if (!isTarget && currentTrial.userResponse === "match") {
          outcome = "falseAlarm";
        } else if (!isTarget && currentTrial.userResponse === undefined) {
          outcome = "correctRejection";
        } else {
          outcome = "miss";
        }

        return {
          ...context.roundData,
          [context.currentRound]: {
            ...currentRoundData,
            trials: [
              ...currentRoundData.trials,
              {
                ...currentTrial,
                outcome,
              },
            ],
          },
        };
      },
    }),
  },
  actors: {
    tickActor: fromCallback<EventObject, { intervalMs: number }>(
      ({ sendBack, input }) => {
        const timer = setInterval(() => {
          console.log("yoza");
          sendBack({ type: "tick" });
        }, input.intervalMs);

        return () => clearInterval(timer);
      }
    ),
  },
  guards: {
    isHit: ({ context }) => {
      return (
        !!context.currentSquare &&
        isReachable(
          "knight",
          context.piecePositionForRound,
          context.currentSquare
        )
      );
    },
    countdownComplete: ({ context }) => context.countdown === 0,
    isGuessCorrect: ({ context }, params: { guess: SquareColor }) => {
      if (context.currentSquare)
        return params.guess === getSquareColor(context.currentSquare);

      return false;
    },
  },
}).createMachine({
  id: "gameMachine",
  initial: "idle",
  context: {
    currentSquare: undefined,
    score: 0,
    voiceEnabled: true,
    countdown: 3,
    positionsForRound: [],
    guessesRemainingInRound: TRIALS_PER_ROUND,
    piecePositionForRound: "",
    currentGuess: undefined,
    incorrectCount: 0,
    currentRound: 0,
    roundData: [],
  },
  states: {
    idle: {
      on: {
        start: "playing",
        "voice.toggle": {
          actions: assign({
            voiceEnabled: ({ context }) => !context.voiceEnabled,
          }),
        },
      },
    },
    countdown: {
      //   invoke: {
      //     src: "tickActor",
      //     input: { intervalMs: 1000 },
      //   },
      on: {
        tick: [
          {
            target: "playing",
            guard: "countdownComplete",
            actions: ["initialiseCountdown"],
          },
          {
            actions: ["decrementCountdown"],
          },
        ],
      },
    },
    playing: {
      initial: "startingRound",
      states: {
        startingRound: {
          entry: ["initialiseNextRound", "announcePiecePosition"],
          after: {
            3000: "playingRound",
          },
        },
        playingRound: {
          entry: ["setupNextTrial", "announceSquare"],
          invoke: {
            src: "tickActor",
            input: { intervalMs: 3000 },
          },
          on: {
            tick: [
              {
                guard: ({ context }) => context.guessesRemainingInRound > 1,
                actions: [
                  "decrementGuessesRemainingInRound",
                  "evaluateGuess",
                  "setupNextTrial",
                  "announceSquare",
                  "clearCurrentGuess",
                ],
                target: ".waitingForResponse",
              },
              {
                guard: ({ context }) =>
                  context.currentRound >= NUMBER_OF_ROUNDS,
                target: "#gameOver",
                actions: ["calculateAccuracyScore"],
              },
              {
                target: "startingRound",
              },
            ],
          },
          initial: "waitingForResponse",
          states: {
            waitingForResponse: {
              on: {
                userResponse: [
                  {
                    guard: "isHit",
                    target: "hit",
                    actions: [
                      {
                        type: "saveUserResponse",
                        params: ({ event }) => ({
                          userResponse: event.userResponse,
                        }),
                      },
                      "evaluateGuess",
                    ],
                  },
                  {
                    target: "falseAlarm",
                    actions: [
                      {
                        type: "saveUserResponse",
                        params: ({ event }) => ({
                          userResponse: event.userResponse,
                        }),
                      },
                      "evaluateGuess",
                    ],
                  },
                ],
              },
            },
            hit: {
              tags: ["hit"],
            },
            falseAlarm: {
              tags: ["falseAlarm"],
            },
          },
        },
      },
    },
    gameOver: {
      id: "gameOver",
      on: { restart: "idle" },
    },
  },
});

function generatePositionsForRound(
  piece: "knight" | "bishop",
  position: string,
  roundLength: number
): { positions: string[]; positiveSampleCount: number } {
  // ensure 2 or 3 of the positions are reachable for the piece
  const reachablePositions = getReachablePositions(piece, position);
  const targetPositiveSamplePercentage = Math.random() > 0.5 ? 0.6 : 0.4;
  const targetReachableCount = Math.floor(
    roundLength * targetPositiveSamplePercentage
  );
  const selectedPositions: Array<string> = [];

  for (let i = 0; i < roundLength; i++) {
    if (i < targetReachableCount) {
      let randomReachablePosition = getRandomArrayElement(reachablePositions);
      // ensure no duplicates
      while (selectedPositions.includes(randomReachablePosition)) {
        randomReachablePosition = getRandomArrayElement(reachablePositions);
      }
      selectedPositions.push(randomReachablePosition);
    } else {
      let randomPosition = getRandomSquare();
      // ensure no duplicates
      while (selectedPositions.includes(randomPosition)) {
        randomPosition = getRandomSquare();
      }
      selectedPositions.push(randomPosition);
    }
  }

  return {
    positions: shuffleArray(selectedPositions),
    positiveSampleCount: targetReachableCount,
  };
}

function getRandomArrayElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getReachablePositions(
  piece: "knight" | "bishop",
  position: string
): string[] {
  const reachablePositions = [];
  if (piece === "knight") {
    // get all possible knight moves
    const knightMoves = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    const [file, rank] = position.split("");
    console.log(piece, position);
    for (const move of knightMoves) {
      const [fileOffset, rankOffset] = move;
      const newFile = String.fromCharCode(file.charCodeAt(0) + fileOffset);
      const newRank = String.fromCharCode(rank.charCodeAt(0) + rankOffset);
      if (
        newFile >= "a" &&
        newFile <= "h" &&
        newRank >= "1" &&
        newRank <= "8"
      ) {
        reachablePositions.push(`${newFile}${newRank}`);
      }
    }
  } else if (piece === "bishop") {
    // get all possible bishop moves
    const bishopMoves = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    const [file, rank] = position.split("");
    for (const move of bishopMoves) {
      let [fileOffset, rankOffset] = move;
      let newFile = String.fromCharCode(file.charCodeAt(0) + fileOffset);
      let newRank = String.fromCharCode(rank.charCodeAt(0) + rankOffset);
      while (
        newFile >= "a" &&
        newFile <= "h" &&
        newRank >= "1" &&
        newRank <= "8"
      ) {
        reachablePositions.push(`${newFile}${newRank}`);
        fileOffset += move[0];
        rankOffset += move[1];
        newFile = String.fromCharCode(file.charCodeAt(0) + fileOffset);
        newRank = String.fromCharCode(rank.charCodeAt(0) + rankOffset);
      }
    }
  }
  return reachablePositions;
}

function isReachable(
  piece: "knight" | "bishop",
  start: string,
  end: string
): boolean {
  const reachablePositions = getReachablePositions(piece, start);
  return reachablePositions.includes(end);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffledArray = [...array];
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]];
  }
  return shuffledArray;
}

function calculateAccuracyScore(roundData: RoundData): number {
  let totalTrials = 0;
  let correctResponses = 0;

  for (const round of Object.values(roundData)) {
    for (const trial of round.trials) {
      totalTrials++;
      if (trial.outcome === "hit" || trial.outcome === "correctRejection") {
        correctResponses++;
      }
    }
  }

  // Avoid division by zero
  if (totalTrials === 0) {
    return 0;
  }

  const accuracy = correctResponses / totalTrials;

  // Convert to percentage and round to two decimal places
  return Math.round(accuracy * 10000) / 100;
}
