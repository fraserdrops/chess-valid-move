import {
  Box,
  Button,
  Container,
  FormControlLabel,
  Switch,
  Typography,
} from "@mui/material";
import { useMachine } from "@xstate/react";
import React, { useCallback, useEffect } from "react";
import "./App.css";
import { gameMachine } from "./machines/gameMachine";

import { createBrowserInspector } from "@statelyai/inspect";

const { inspect } = createBrowserInspector();

function App() {
  const [state, send] = useMachine(gameMachine, { inspect });

  const handleUserResponse = useCallback(() => {
    send({ type: "userResponse", userResponse: "match" });
  }, [send]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (state.matches("playing")) {
        if (event.key === "l") {
          handleUserResponse();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleUserResponse, state]);

  const handleStart = () => {
    send({ type: "start" });
  };

  const handleVoiceToggle = () => {
    send({ type: "voice.toggle" });
  };

  let outcome: undefined | "hit" | "falseAlarm" = undefined;
  if (state.hasTag("hit")) outcome = "hit";
  if (state.hasTag("falseAlarm")) outcome = "falseAlarm";

  let color: "secondary" | "error" | "success" = "secondary";
  if (outcome === "falseAlarm") {
    color = "error";
  }

  if (outcome === "hit") {
    color = "success";
  }

  return (
    <Container maxWidth="sm">
      <Typography variant="h4" component="h1" gutterBottom>
        Chess Vision Trainer
      </Typography>
      {state.matches("idle") && (
        <>
          <Button variant="contained" onClick={handleStart}>
            Start Game
          </Button>
          <FormControlLabel
            control={
              <Switch
                checked={state.context.voiceEnabled}
                onChange={handleVoiceToggle}
                name="voiceToggle"
                color="primary"
              />
            }
            label="Enable Voice"
          />
        </>
      )}
      {state.matches("playing") && (
        <Box>
          <Typography variant="h5">
            Round: {state.context.currentRound}
          </Typography>
          <Typography variant="h5">
            Current Round Piece Position: Knight{" "}
            {state.context.piecePositionForRound}
          </Typography>
          <Typography variant="h5">
            Current Square: {state.context.currentSquare}
          </Typography>
          <Typography variant="h6">
            Remaining in Round: {state.context.guessesRemainingInRound}
          </Typography>
          <Typography variant="h6">Score: {state.context.score}</Typography>
          <Button
            variant="contained"
            color={color}
            onClick={() => handleUserResponse()}
          >
            Match
          </Button>
        </Box>
      )}
      {state.matches("gameOver") && (
        <Box>
          <Typography variant="h5">Game Over!</Typography>
          <Typography variant="h6">
            Accuracy: {state.context.accuracyScore}
          </Typography>
          <Button variant="contained" onClick={() => send({ type: "restart" })}>
            Play Again
          </Button>
        </Box>
      )}
    </Container>
  );
}

export default App;
