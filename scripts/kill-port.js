const { execSync } = require("child_process");

const port = Number(process.env.PORT || process.argv[2] || 8787);

if (!Number.isFinite(port) || port <= 0) {
  console.error("Invalid port");
  process.exit(1);
}

function killWindows(port) {
  let output = "";
  try {
    output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (_) {
    console.log(`Port ${port} is free`);
    return;
  }

  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== "0") {
      pids.add(pid);
    }
  }

  if (!pids.size) {
    console.log(`Port ${port} is free`);
    return;
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: "inherit" });
      console.log(`Killed PID ${pid} on port ${port}`);
    } catch (_) {
      console.error(`Could not kill PID ${pid}`);
    }
  }
}

function killUnix(port) {
  let output = "";
  try {
    output = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (_) {
    console.log(`Port ${port} is free`);
    return;
  }

  const pids = output
    .split(/\r?\n/)
    .map((v) => v.trim())
    .filter(Boolean);

  if (!pids.length) {
    console.log(`Port ${port} is free`);
    return;
  }

  for (const pid of pids) {
    try {
      execSync(`kill -9 ${pid}`, { stdio: "inherit" });
      console.log(`Killed PID ${pid} on port ${port}`);
    } catch (_) {
      console.error(`Could not kill PID ${pid}`);
    }
  }
}

if (process.platform === "win32") {
  killWindows(port);
} else {
  killUnix(port);
}
