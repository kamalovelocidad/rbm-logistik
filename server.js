const WebSocket = require('ws');
const http = require('http');

const AISSTREAM_API_KEY = process.env.AISSTREAM_API_KEY || "2f5c28747be6fe846a758ebe69bf6db1ae96e877";
const PORT = process.env.PORT || 3000;

// HTTP server to serve vessel positions to your frontend tracking page
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const targetMMSI = urlParams.get('mmsi');

  if (!targetMMSI) {
    res.writeHead(400);
    return res.end(JSON.stringify({ error: "MMSI parameter required" }));
  }

  // Fetch latest cached position for requested MMSI
  const pos = vesselPositions.get(Number(targetMMSI));
  if (pos) {
    res.writeHead(200);
    res.end(JSON.stringify(pos));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Position data not yet received for this MMSI" }));
  }
});

// Cache for live vessel positions
const vesselPositions = new Map();

function connectAISStream() {
  const ws = new WebSocket("wss://stream.aisstream.io/v1/stream");

  ws.on('open', () => {
    console.log("Connected to AISstream.io WebSocket");
    
    // Subscribe to global bounds or targeted MMSIs
    const subscriptionMessage = {
      APIKey: AISSTREAM_API_KEY,
      BoundingBoxes: [[[-90, -180], [90, 180]]],
      FilterMessageTypes: ["PositionReport"]
    };

    ws.send(JSON.stringify(subscriptionMessage));
  });

  ws.on('message', (data) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed.MessageType === "PositionReport") {
        const report = parsed.Message.PositionReport;
        const mmsi = report.UserID;

        // Store live coordinates, speed, heading, and timestamp
        vesselPositions.set(mmsi, {
          mmsi: mmsi,
          latitude: report.Latitude,
          longitude: report.Longitude,
          sog: report.Sog, // Speed Over Ground (knots)
          cog: report.Cog, // Course Over Ground
          heading: report.TrueHeading,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.error("Error parsing AIS message:", e);
    }
  });

  ws.on('close', () => {
    console.log("AISstream connection closed. Reconnecting in 5 seconds...");
    setTimeout(connectAISStream, 5000);
  });

  ws.on('error', (err) => {
    console.error("AISstream WebSocket error:", err);
    ws.close();
  });
}

connectAISStream();

server.listen(PORT, () => {
  console.log(`Vessel tracking proxy running on port ${PORT}`);
});
