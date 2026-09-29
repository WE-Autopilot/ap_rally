// Original ranking rules, moved from game.js without algorithm changes.
function submitEntry(data, payload) {
  const { trackIndex, name, time, gap, date } = payload;
        const key = String(trackIndex);
        if (!data[key]) data[key] = [];

        const existingIdx = data[key].findIndex(e => e.name.toLowerCase() === name.trim().toLowerCase());
        if (existingIdx !== -1) {
          if (time < data[key][existingIdx].time) {
            data[key][existingIdx].time = time;
            data[key][existingIdx].gap = gap;
            data[key][existingIdx].date = date || new Date().toISOString();
          }
        } else {
          data[key].push({
            name: name.trim(),
            time,
            gap,
            date: date || new Date().toISOString()
          });
        }

        data[key].sort((a, b) => a.time - b.time);
        data[key] = data[key].slice(0, 50);

  return data[key];
}
module.exports = { submitEntry };
