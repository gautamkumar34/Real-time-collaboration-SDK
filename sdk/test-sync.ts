// sdk/test-sync.ts
import CollabDoc from './src/collab-doc';
import { Operation } from './src/collab-doc'; // Import Operation interface if needed for types

// --- Configuration ---
const SERVER_URL = 'http://localhost:8080';
const ROOM_ID = 'my-collab-document'; // All clients will join this room

// --- Helper to wait for a specific event ---
function waitForEvent(emitter: CollabDoc, eventName: string): Promise<void> {
    return new Promise(resolve => {
        emitter.once(eventName, () => {
            resolve();
        });
    });
}

async function runIntegrationTest() {
    console.log('--- Starting CollabDoc Socket.IO Integration Test ---');

    // --- Client 1 (Actor Alpha) ---
    const doc1 = new CollabDoc({
        roomId: ROOM_ID,
        actorId: 'Alpha',
        serverUrl: SERVER_URL
    });

    // --- Client 2 (Actor Beta) ---
    const doc2 = new CollabDoc({
        roomId: ROOM_ID,
        actorId: 'Beta',
        serverUrl: SERVER_URL
    });

    const doc1Changes: any[] = [];
    doc1.on('change', change => { // 'change' event listener
        console.log(`Doc1 (Alpha) onChange:`, JSON.stringify(change));
        doc1Changes.push(change);
    });

    const doc2Changes: any[] = [];
    doc2.on('change', change => { // 'change' event listener
        console.log(`Doc2 (Beta) onChange:`, JSON.stringify(change));
        doc2Changes.push(change);
    });

    // --- Connect both clients ---
    console.log('\nConnecting Doc1 (Alpha)...');
    doc1.connect();
    await waitForEvent(doc1, 'connect'); // Wait for socket to connect
    await waitForEvent(doc1, 'synced'); // Wait for initial_state (and offline queue if applicable)

    console.log('\nConnecting Doc2 (Beta)...');
    doc2.connect();
    await waitForEvent(doc2, 'connect'); // Wait for socket to connect
    await waitForEvent(doc2, 'synced'); // Wait for initial_state

    // Allow a brief moment for initial state to settle on doc2, especially if doc1 had an offline queue
    await new Promise(resolve => setTimeout(resolve, 200));

    // --- Initialize data from Doc1 (since the server is the source of truth for initial state) ---
    console.log('\n--- Initializing data from Doc1 after connection ---');
    doc1.set(['message'], "Hello from Alpha!");
    doc1.set(['count'], 0);
    await new Promise(resolve => setTimeout(resolve, 500)); // Allow propagation to server and then to Doc2

    console.log('\n--- Initial State Check ---');
    console.log('Doc1 (Alpha) state:', doc1.getDocumentState());
    console.log('Doc2 (Beta) state:', doc2.getDocumentState());
    console.assert(JSON.stringify(doc1.getDocumentState()) === JSON.stringify(doc2.getDocumentState()),
        'FAIL: Initial states do not match after Doc1 sets data!');
    if (JSON.stringify(doc1.getDocumentState()) === JSON.stringify(doc2.getDocumentState())) {
        console.log('SUCCESS: Initial states match after Doc1 sets data!');
    }


    // --- Test 1: Doc1 makes a change, Doc2 should receive it ---
    console.log('\n--- Test 1: Doc1 sets "status", Doc2 should reflect it ---');
    doc1.set(['status'], 'active');
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for propagation

    console.log('Doc1 (Alpha) state after set:', doc1.getDocumentState());
    console.log('Doc2 (Beta) state after set:', doc2.getDocumentState());
    console.assert(doc2.get(['status']) === 'active', 'FAIL: Doc2 did not receive Doc1\'s set!');
    if (doc2.get(['status']) === 'active') {
        console.log('SUCCESS: Doc2 received Doc1\'s set operation.');
    }

    // --- Test 2: Doc2 makes a change, Doc1 should receive it ---
    console.log('\n--- Test 2: Doc2 sets "data.value", Doc1 should reflect it ---');
    doc2.set(['data', 'value'], 123);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for propagation

    console.log('Doc1 (Alpha) state after Doc2 set:', doc1.getDocumentState());
    console.log('Doc2 (Beta) state after Doc2 set:', doc2.getDocumentState());
    console.assert(doc1.get(['data', 'value']) === 123, 'FAIL: Doc1 did not receive Doc2\'s set!');
    if (doc1.get(['data', 'value']) === 123) {
        console.log('SUCCESS: Doc1 received Doc2\'s set operation.');
    }

    // --- Test 3: Last-Write-Wins (Timestamp) ---
    console.log('\n--- Test 3: Last-Write-Wins (Timestamp) ---');
    // Both clients set the same path, but Doc2 sets later with a higher timestamp
    console.log('Doc1 (Alpha) sets "conflict" at time T1...');
    doc1.set(['conflict'], 'value-alpha-earlier');
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay for timestamps to differ

    console.log('Doc2 (Beta) sets "conflict" at time T2 (later than T1)...');
    doc2.set(['conflict'], 'value-beta-later');
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for propagation and resolution

    console.log('Doc1 (Alpha) state after conflict:', doc1.getDocumentState());
    console.log('Doc2 (Beta) state after conflict:', doc2.getDocumentState());
    // Doc2's operation (later timestamp) should win
    console.assert(doc1.get(['conflict']) === 'value-beta-later' && doc2.get(['conflict']) === 'value-beta-later',
        'FAIL: LWW timestamp conflict not resolved correctly! Expected "value-beta-later".');
    if (doc1.get(['conflict']) === 'value-beta-later' && doc2.get(['conflict']) === 'value-beta-later') {
        console.log('SUCCESS: LWW timestamp conflict resolved. Later write wins.');
    }


    // --- Test 4: Delete operation sync ---
    console.log('\n--- Test 4: Doc1 deletes "message", Doc2 should reflect it ---');
    doc1.delete(['message']);
    await new Promise(resolve => setTimeout(resolve, 500)); // Wait for propagation

    console.log('Doc1 (Alpha) state after delete:', doc1.getDocumentState());
    console.log('Doc2 (Beta) state after delete:', doc2.getDocumentState());
    console.assert(doc2.get(['message']) === undefined, 'FAIL: Doc2 did not receive Doc1\'s delete!');
    if (doc2.get(['message']) === undefined) {
        console.log('SUCCESS: Doc2 received Doc1\'s delete operation.');
    }

    console.log('\n--- CollabDoc Integration Test Complete ---');

    // --- Disconnect clients ---
    doc1.disconnect();
    doc2.disconnect();

    // Give sockets a moment to close
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(0); // Exit the script gracefully
}

runIntegrationTest().catch(error => {
    console.error('Integration test failed:', error);
    process.exit(1); // Exit with error code
});