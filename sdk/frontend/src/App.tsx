import React, { useEffect, useState } from "react";
import "./App.css";
import { waitForTransactionReceipt, writeContract } from "@wagmi/core";
import { abi } from "./ABI.json";
import { Spin } from "spin";
import { config } from "./web3";
import { readContract } from "wagmi/actions";
import { TaskStatus } from "zkwasm-service-helper";

const GAME_CONTRACT_ADDRESS = import.meta.env.VITE_GAME_CONTRACT_ADDRESS;
const ZK_USER_ADDRESS = import.meta.env.VITE_ZK_CLOUD_USER_ADDRESS;
const ZK_USER_PRIVATE_KEY = import.meta.env.VITE_ZK_CLOUD_USER_PRIVATE_KEY;
const ZK_IMAGE_MD5 = import.meta.env.VITE_ZK_CLOUD_IMAGE_MD5;
const ZK_CLOUD_RPC_URL = import.meta.env.VITE_ZK_CLOUD_URL;

interface GameState {
    total_steps: number;
    current_position: number;
}

/* This function is used to verify the proof on-chain */
async function verify_onchain({
    proof,
    verify_instance,
    aux,
    instances,
}: {
    proof: BigInt[];
    verify_instance: BigInt[];
    aux: BigInt[];
    instances: BigInt[];
    status: TaskStatus;
}) {
    console.log("proof", proof, verify_instance, aux, instances);
    const result = await writeContract(config, {
        abi,
        address: GAME_CONTRACT_ADDRESS,
        functionName: "settleProof",
        args: [proof, verify_instance, aux, [instances]],
    });
    const transactionReceipt = waitForTransactionReceipt(config, {
        hash: result,
    });
    return transactionReceipt;
}

/* This function is used to get the on-chain game states */
async function getOnchainGameStates() {
    const result = (await readContract(config, {
        abi,
        address: GAME_CONTRACT_ADDRESS,
        functionName: "getStates",
        args: [],
    })) as [BigInt, BigInt];
    return result.map((r) => Number(r));
}

let spin: Spin;

function App() {
    useEffect(() => {
        getOnchainGameStates().then((result): any => {
            const total_steps = result[0];
            const current_position = result[1];

            console.log("total_steps = ", total_steps);
            console.log("current_position = ", current_position);
            setOnChainGameStates({
                total_steps,
                current_position,
            });

            spin = new Spin({
                onReady: onGameInitReady(total_steps, current_position),
                cloudCredentials: {
                    CLOUD_RPC_URL: ZK_CLOUD_RPC_URL,
                    USER_ADDRESS: ZK_USER_ADDRESS,
                    USER_PRIVATE_KEY: ZK_USER_PRIVATE_KEY,
                    IMAGE_HASH: ZK_IMAGE_MD5,
                },
            });
        });
    }, []);

    const [gameState, setGameState] = useState<GameState>({
        total_steps: 0,
        current_position: 0,
    });

    const [onChainGameStates, setOnChainGameStates] = useState<GameState>({
        total_steps: 0,
        current_position: 0,
    });

    const [moves, setMoves] = useState<number[]>([]);

    const onClick = (command: number) => () => {
        spin.step(command);
        updateDisplay();
    };

    const updateDisplay = () => {
        const newGameState = spin.getGameState();
        setGameState(newGameState);
        setMoves(spin.witness);
    };

    const onGameInitReady =
        (total_steps: number, current_position: number) => () => {
            spin.init_game(total_steps, current_position);

            updateDisplay();
        };

    // Submit the proof to the cloud
    const submitProof = async () => {
        const proof = await spin.generateProof();

        if (!proof) {
            console.error("Proof generation failed");
            return;
        }
        // onchain verification operations
        console.log("submitting proof");
        const verificationResult = await verify_onchain(proof);

        console.log("verificationResult = ", verificationResult);

        // wait for the transaction to be broadcasted, better way is to use event listener
        await new Promise((r) => setTimeout(r, 1000));

        const gameStates = await getOnchainGameStates();

        setOnChainGameStates({
            total_steps: gameStates[0],
            current_position: gameStates[1],
        });

        spin.reset(onGameInitReady(gameStates[0], gameStates[1]));
    };

    return (
        <div className="App">
            <header className="App-header">
                <w3m-button />
                <header>GamePlay</header>
                <header>Number of Moves: {moves.length}</header>
                <header>
                    How to Play: this game let the player increase or decrease
                    the position. The position ranges from 0-10. It keeps track
                    of the total steps so far and current position. When
                    submitted on-chain, the progresses are updated and recorded
                    on-chain{" "}
                </header>
                <header>Game State: {JSON.stringify(gameState)}</header>
                <header>
                    OnChain Game State: {JSON.stringify(onChainGameStates)}
                </header>
                <button onClick={onClick(0)}>Decrement</button>
                <button onClick={onClick(1)}>Increment</button>
            </header>
            <button onClick={submitProof}>Submit</button>
        </div>
    );
}

export default App;
