const fs = require('fs');
const https = require('https');

function downloadItems() {
  const url = `https://templeosrs.com/api/collection-log/items.php`;
  console.log(url);
  return new Promise((resolve, reject) => {
    let data = "";
    https.get(url, function(response) {
      response.on('data', append => data += append);
      response.on('error', e => {
        console.log(e);
        resolve(undefined);
      });
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json || json["error"]) resolve(undefined);
          else resolve(json["items"]);
        } catch (e) {
          console.log('items parse error:', e.message);
          resolve(undefined);
        }
      });
    });
  });
}

function downloadGroupClogs(groupId) {
  const url = `https://templeosrs.com/api/collection-log/group_collection_log.php?group=${groupId}&categories=all&includecount=1`;
  console.log(url);
  return new Promise((resolve, reject) => {
    let data = "";
    https.get(url, function(response) {
      response.on('data', append => data += append);
      response.on('error', e => {
        console.log(e);
        resolve(undefined);
      });
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json || json["error"]) resolve(undefined);
          else resolve(json["data"]);
        } catch (e) {
          console.log('group clogs parse error:', e.message);
          resolve(undefined);
        }
      });
    });
  });
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace(/:/g, '-');
}

function loadOrCreate(path, defaultValue) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch {
    return defaultValue;
  }
}

function computeMemberDelta(previousItems, currentItems) {
  const delta = {};
  for (const [itemId, count] of Object.entries(currentItems)) {
    const prev = previousItems[itemId] || 0;
    if (count > prev) {
      delta[itemId] = count - prev;
    }
  }
  return delta;
}

(async function() {
  const groupId = 2802;

  const items = await downloadItems();
  fs.writeFileSync(`data/items.json`, JSON.stringify(items, null, 4));

  const groupClogs = await downloadGroupClogs(groupId);
  if (!groupClogs) {
    console.log('Failed to download group clogs');
    return;
  }

  const timestamp = getTimestamp();
  const clanHistoryPath = `data/clan_history.json`;
  const membersDir = `data/members`;

  fs.mkdirSync(membersDir, { recursive: true });

  const clanHistory = loadOrCreate(clanHistoryPath, {
    group_id: groupClogs.group_id,
    group_name: groupClogs.group_name,
    runs: []
  });

  const previousRun = clanHistory.runs[clanHistory.runs.length - 1];
  const previousPlayerSet = new Set();
  if (previousRun) {
    // Collect previous player names from member files to detect removals
    for (const f of fs.readdirSync(membersDir)) {
      if (f.endsWith('.json')) previousPlayerSet.add(f.slice(0, -5));
    }
  }

  const currentPlayerSet = new Set(groupClogs.members.map(m => m.player));
  const membersAdded = [...currentPlayerSet].filter(p => !previousPlayerSet.has(p));
  const membersRemoved = [...previousPlayerSet].filter(p => !currentPlayerSet.has(p));
  const memberDeltas = {};

  for (const member of groupClogs.members) {
    const player = member.player;
    const memberPath = `${membersDir}/${player}.json`;
    const memberHistory = loadOrCreate(memberPath, { player, snapshots: [] });

    memberHistory.display_name = member.player_name_with_capitalization || player;

    const previousSnapshot = memberHistory.snapshots[memberHistory.snapshots.length - 1];

    let changed = !previousSnapshot;
    if (previousSnapshot) {
      const delta = computeMemberDelta(previousSnapshot.items, member.items);
      if (Object.keys(delta).length > 0) {
        memberDeltas[player] = delta;
        changed = true;
      }
    }

    if (changed) {
      memberHistory.snapshots.push({ timestamp, items: member.items });
      fs.writeFileSync(memberPath, JSON.stringify(memberHistory));
    }
  }

  const runEntry = { timestamp, members_added: membersAdded, members_removed: membersRemoved, member_deltas: memberDeltas };
  clanHistory.runs.push(runEntry);
  clanHistory.group_name = groupClogs.group_name;

  fs.writeFileSync(clanHistoryPath, JSON.stringify(clanHistory));

  console.log(`Saved snapshot ${timestamp}: ${membersAdded.length} added, ${membersRemoved.length} removed, ${Object.keys(memberDeltas).length} members with changes`);
})();
