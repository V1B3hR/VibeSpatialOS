# 🌌 VIBE SpatialOS & Studio (v2.0 Enterprise R&D)

[![Tests](https://img.shields.io/badge/Tests-47%20Passing%20(100%25)-00ff88?style=flat-square&logo=node.js)](file:///tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-00f0ff?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-ffaa00?style=flat-square&logo=three.js)](https://threejs.org/)
[![License](https://img.shields.io/badge/License-Source--Available%20Commercial-a855f7?style=flat-square)](./LICENSE)

**VIBE SpatialOS & Studio** to bezgogliowy, adaptacyjny system przestrzennego projektowania 3D, Digital Twin oraz warstwa abstrakcji sprzętowej (HAL) z zamkniętą pętlą sprzężenia optyczno-sensorycznego (SVD), haptyką ultradźwiękową 40 kHz w powietrzu, uniwersalnym mostkiem CAD/BIM oraz kontrolerem ubieralnym 9-DoF IMU/EMG.

---

## 🏛️ Architektura Systemowa (Monorepo)

```
c:\Projekty\Vibe SpatialOS/
├── packages/
│   ├── spatial-core/        # Unified ℝ³ Space, OBB, Kalman 15ms, Haptics 40kHz Solver,
│   │                        # SpatialNodeGraph, WearableDeviceManager, HapticGridSnapper, CADBridgeConnector
│   ├── semantic-ai/         # Deictic Multimodal Context Resolver (Gaze + Pointing + Speech), Semantic LOD
│   └── closed-loop/         # 6-DoF Kabsch-Umeyama SVD Closed-Loop Optical Auto-Calibrator
├── apps/
│   ├── web-simulator/       # Three.js Digital Twin Studio, Holographic 3D Wayfinding, Telemetry Glass HUD
│   └── spatial-gateway/     # UDP Multicast (60Hz) & WebSocket Telemetry Server
├── hardware/
│   ├── wokwi/               # RP2040 + VL53L5CX (SPI DMA) + W5500 Multicast Firmware
│   └── falstad/             # TC4428 40kHz Push-Pull + 200Hz AM Modulator Circuit
├── tests/
│   ├── math-core.test.ts          # Core vector, quaternion & OBB collision verification
│   ├── multimodal-agent.test.ts   # Multimodal deictic NLP & bimanual AI tests
│   ├── spatial-node-graph.test.ts # Hierarchical node partitioning & BFS wayfinding tests
│   ├── wearable-device.test.ts    # VIBE Pulse IMU 500Hz, EMG grip & MIDI 2.0 tests
│   ├── haptic-grid-snapper.test.ts# Mid-air 1-100mm grid snapping & acoustic detent tests
│   └── cad-bridge.test.ts         # SolidWorks, Rhino 8 & Revit bidirectional bridge tests
└── LICENSE                  # Source-Available Commercial & Hardware-Bound License
```

---

## ⚡ Kluczowe Podsystemy i Innowacje

### 1. Zorientowane Bryły Brzegowe (OBB) & Gaussian Cone-Casting
- Obliczanie kolizji promienia wzroku/dłoni za pomocą **Slab Method w przestrzeni lokalnej OBB** (transformacja odwrotnym kwaternionem $q^*$).
- **Cone-Casting z wagowaniem Gaussa**: eliminuje drżenie dłoni (jitter) przy wskazywaniu obiektów w przestrzeni $\mathbb{R}^3$.

### 2. Histereza Gestów (Dual-Threshold Schmitt Trigger)
- Eliminacja migotania stanu (contact-chatter):
  - **Próg wejścia w gest (Pinch Enter):** $\le 20.0\text{ mm}$
  - **Próg wyjścia z gestu (Pinch Exit):** $\ge 35.0\text{ mm}$
  - **Strefa nieczułości (Hysteresis Band):** $15.0\text{ mm}$

### 3. Predykcja Ruchu (Dead-Reckoning Kalman 15ms)
- Kompensacja opóźnienia Motion-to-Photon projektora / wyświetlacza:
  $$\vec{P}_{pred} = \vec{P}(t) + \vec{V}(t) \cdot \Delta t + \frac{1}{2}\vec{A}(t) \cdot \Delta t^2 \quad (\Delta t = 15\text{ ms})$$

### 4. Zamknięta Pętla Samokalibracji (Kabsch-Umeyama SVD)
- Wyliczenie optymalnej macierzy rotacji $R \in SO(3)$ i translacji $\vec{t}$ minimalizującej błąd resztkowy $E_{RMS}$:
  $$H = \sum_{k=1}^N (P_{exp}^{(k)} - \vec{\mu}_X)(P_{obs}^{(k)} - \vec{\mu}_Y)^T = U \Sigma V^T \implies R = V \text{diag}(1, 1, \det(V U^T)) U^T$$

### 5. Haptyka Ultradźwiękowa Mid-Air (40 kHz + 200 Hz AM)
- Przesunięcia fazowe $\phi_i$ dla macierzy przetworników piezoelektrycznych tworzą ognisko interferencji konstruktywnej.
- Modulacja amplitudowa falą nośną $f_{mod} = 200\text{ Hz}$ bezpośrednio pobudza receptory Meissnera i Paciniego w skórze dłoni:
  $$P_i(t) = A_i \cdot \frac{1}{2}(1 + \sin(2\pi f_{mod} t)) \cdot \sin(2\pi f_{carrier} t + \phi_i)$$

### 6. Wirtualne Linijki & Przyciąganie do Siatki (`HapticGridSnapper`)
- Generowanie wyczuwalnych impulsów haptycznych (tzw. *haptic detents*) o ciśnieniu $1.35$–$2.55\text{ kPa}$ podczas przekraczania linii siatki metrycznej ($1\text{mm}$, $5\text{mm}$, $10\text{mm}$, $50\text{mm}$, $100\text{mm}$) w pustym powietrzu.

### 7. Hierarchiczny Graf Węzłów Przestrzennych (`SpatialNodeGraph`)
- Podział wielkich projektów na klastry z automatycznym przełączaniem LOD przy oddalaniu kamery (makro-klastry z holograficznymi drogowskazami vs mikroskala).

### 8. VIBE Pulse – Kontroler Ubieralny 9-DoF IMU & EMG
- Detekcja gestów nadgarstka (*Wrist Flick Left/Right* -> Undo/Redo) oraz automatyczna blokada płaszczyzn modelowania ($XY$, $XZ$, $YZ$).
- Detekcja siły chwytu EMG z histerezą – precyzyjny chwyt działający nawet przy zasłonięciu kamer optycznych.

### 9. Uniwersalny Mostek CAD/BIM (`@vibe/cad-bridge`)
- Dwukierunkowa synchronizacja geometrii i złożeń w czasie rzeczywistym (60–120 Hz) z **SolidWorks, Rhino 8, Autodesk Revit, AutoCAD i Blenderem**.

---

## 🚀 Szybki Start

```bash
# 1. Instalacja zależności
npm install

# 2. Uruchomienie Web Simulatora (Three.js Digital Twin)
npm run dev

# 3. Uruchomienie Bramki Telemetrycznej (UDP + WebSocket)
npm run dev:gateway

# 4. Uruchomienie Wszystkich Usług Równolegle
npm run dev:all

# 5. Uruchomienie Pełnej Suity Testowej (47 testów)
npm test
```

---

## 🎮 Sterowanie w Symulatorze 3D

| Akcja | Klawisz / Mysz |
|---|---|
| **Obrót kamery wokół sceny** | Lewy przycisk myszy + przeciąganie |
| **Zoom kamery** | Rolka myszy |
| **Ruch wirtualnej dłoni 3D (X/Y)** | Prawy przycisk myszy lub Shift + ruch |
| **Głębokość dłoni (Z)** | Shift + Rolka myszy |
| **Chwyt / Gest Pinch** | `Spacja` lub przycisk `PINCH [SPACE]` |
| **Auto-Kalibracja SVD** | Przycisk `AUTO-CALIBRATE` na górnym pasku |
| **Gesty VIBE Pulse** | Przyciski `Flick Left`, `Flick Right`, `Tilt XY`, `Squeeze Grip` |
| **Głosowe Polecenia AI** | Dolna konsola (lub kliknięcie chipów promptów) |

---

## 📜 Licencja i Prawa Własności Intelektualnej

Projekt jest udostępniany na licencji **VIBE SpatialOS Source-Available Commercial & Hardware-Bound License** (zob. plik [LICENSE](./LICENSE)). 

* **Użytek niekomercyjny i ewaluacyjny**: Dozwolony bezpłatnie do celów badawczych i edukacyjnych.
* **Użytek komercyjny oraz klonowanie/produkcja sprzętu elektronicznego** (w tym macierzy przetworników 40 kHz, bransoletki VIBE Pulse oraz węzłów ToF): **Wymaga odpłatnej licencji komercyjnej od właściciela praw autorskich**.
