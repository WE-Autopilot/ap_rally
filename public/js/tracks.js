    // Track definitions
    const CIRCUITS = [
      {
        name: "Grand Hairpin",
        laps: 2,
        roadWidth: 90,
        nodes: [
          { x: 300, y: 700 },
          { x: 1200, y: 700 },
          { x: 1450, y: 550 },
          { x: 1200, y: 400 },
          { x: 800, y: 400 },
          { x: 600, y: 250 },
          { x: 800, y: 150 },
          { x: 1300, y: 150 },
          { x: 1500, y: 300 },
          { x: 1650, y: 500 },
          { x: 1600, y: 850 },
          { x: 900, y: 950 },
          { x: 300, y: 950 },
          { x: 150, y: 820 }
        ]
      },
      {
        name: "Figure Eight",
        laps: 2,
        roadWidth: 90,
        nodes: [
          { x: 400, y: 500 },
          { x: 600, y: 300 },
          { x: 900, y: 200 },
          { x: 1200, y: 300 },
          { x: 1350, y: 500 },
          { x: 1200, y: 700 },
          { x: 900, y: 800 },
          { x: 600, y: 700 },
          { x: 500, y: 550 },
          { x: 900, y: 500 },
          { x: 1300, y: 500 },
          { x: 1550, y: 350 },
          { x: 1700, y: 200 },
          { x: 1850, y: 350 },
          { x: 1850, y: 650 },
          { x: 1700, y: 800 },
          { x: 1450, y: 650 },
          { x: 900, y: 500 },
          { x: 300, y: 400 },
          { x: 200, y: 500 },
          { x: 250, y: 650 }
        ]
      },
      {
        name: "Omega Hairpin",
        laps: 2,
        roadWidth: 88,
        nodes: [
          { x: 300, y: 800 },
          { x: 900, y: 800 },
          { x: 1100, y: 650 },
          { x: 1000, y: 450 },
          { x: 750, y: 450 },
          { x: 600, y: 350 },
          { x: 650, y: 200 },
          { x: 900, y: 150 },
          { x: 1150, y: 200 },
          { x: 1200, y: 350 },
          { x: 1050, y: 450 },
          { x: 1400, y: 550 },
          { x: 1650, y: 750 },
          { x: 1500, y: 950 },
          { x: 400, y: 950 },
          { x: 200, y: 900 }
        ]
      },
      {
        name: "Suzuka S-Complex",
        laps: 2,
        roadWidth: 92,
        nodes: [
          { x: 250, y: 750 },
          { x: 650, y: 750 },
          { x: 800, y: 600 },
          { x: 950, y: 750 },
          { x: 1100, y: 600 },
          { x: 1250, y: 750 },
          { x: 1450, y: 600 },
          { x: 1600, y: 350 },
          { x: 1450, y: 150 },
          { x: 1100, y: 200 },
          { x: 850, y: 150 },
          { x: 500, y: 200 },
          { x: 300, y: 350 },
          { x: 450, y: 500 },
          { x: 300, y: 650 },
          { x: 150, y: 700 }
        ]
      },
      {
        name: "Twin Helix",
        laps: 2,
        roadWidth: 86,
        nodes: [
          { x: 300, y: 850 },
          { x: 1000, y: 850 },
          { x: 1350, y: 750 },
          { x: 1550, y: 550 },
          { x: 1350, y: 350 },
          { x: 1000, y: 450 },
          { x: 850, y: 600 },
          { x: 650, y: 600 },
          { x: 500, y: 450 },
          { x: 650, y: 250 },
          { x: 1000, y: 200 },
          { x: 1500, y: 200 },
          { x: 1750, y: 400 },
          { x: 1750, y: 750 },
          { x: 1500, y: 950 },
          { x: 400, y: 950 },
          { x: 200, y: 900 }
        ]
      },
      {
        name: "The Colosseum",
        laps: 2,
        roadWidth: 88,
        nodes: [
          { x: 300, y: 800 },
          { x: 750, y: 800 },
          { x: 850, y: 950 },
          { x: 1150, y: 950 },
          { x: 1250, y: 800 },
          { x: 1650, y: 800 },
          { x: 1750, y: 600 },
          { x: 1500, y: 450 },
          { x: 1700, y: 300 },
          { x: 1550, y: 150 },
          { x: 1150, y: 200 },
          { x: 1050, y: 350 },
          { x: 850, y: 350 },
          { x: 750, y: 200 },
          { x: 350, y: 150 },
          { x: 200, y: 350 },
          { x: 450, y: 500 },
          { x: 200, y: 650 }
        ]
      }
    ].map(circuit => ({
      ...circuit,
      roadWidth: circuit.roadWidth * GAME_BALANCE.roadWidthScale,
      nodes: circuit.nodes.map(({ x, y }) => ({
        x: x * GAME_BALANCE.trackScale,
        y: y * GAME_BALANCE.trackScale
      }))
    }));

    let currentTrackIdx = 0;
    let trackSpline = [];
    let trackLength = 0;

    // Catmull-Rom Spline generator for smooth formula tracks
    function generateSpline(controlPoints, segmentsPerEdge = 24) {
      const points = [];
      const n = controlPoints.length;

      for (let i = 0; i < n; i++) {
        const p0 = controlPoints[(i - 1 + n) % n];
        const p1 = controlPoints[i];
        const p2 = controlPoints[(i + 1) % n];
        const p3 = controlPoints[(i + 2) % n];

        for (let tStep = 0; tStep < segmentsPerEdge; tStep++) {
          const t = tStep / segmentsPerEdge;
          const t2 = t * t;
          const t3 = t2 * t;

          const x = 0.5 * (
            (2 * p1.x) +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
          );

          const y = 0.5 * (
            (2 * p1.y) +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
          );

          points.push({ x, y });
        }
      }

      // Calculate cumulative lengths
      let total = 0;
      points[0].dist = 0;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        total += Math.hypot(dx, dy);
        points[i].dist = total;
      }
      return { points, totalLength: total };
    }

    function initTrack(idx) {
      currentTrackIdx = idx;
      const res = generateSpline(CIRCUITS[idx].nodes, 28);
      trackSpline = res.points;
      trackLength = res.totalLength;
    }

