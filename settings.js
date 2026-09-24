/* 豊島ダウンヒル：改造する数字はこのファイル！
   1. 数字を1つ変える → 2. 保存 → 3. ブラウザを更新 → 4. 遊んで比べる
   まず speed を変えてみよう。くわしくは docs/CODERDOJO.md。
   CONFIG はルール、COURSE は道の設計図。カンマ「,」は消さないでね。
   lives / obstacleDensity は旧ルール用。現在の景色モードでは使いません。
   jacketColor / boardColor は画像がないときの3Dモデル用です。
*/
const CONFIG = {
  // ★まずはここ！ 36 → 24 でゆっくり、36 → 54 で速くなる。
  speed: 36,             // 基準の速さ（ゲーム内ユニット / 秒）。1周目・加速後の値
  accelerationResponse: 2.3, // 発進・減速のなめらかさ（大きいほど早く目標速度へ）
  brakeFactor: 0.38,      // ブレーキ中の速さの倍率（0.38 = 38%）
  steeringResponse: 0.10,// ハンドルがなじむ時間（秒）。小さいほどきびきび
  cameraResponse: 0.14,  // カメラが追いつく時間（秒）
  coastDrop: 68,         // 海側の斜面の落差。景色の高さをつくる（20〜90）
  lapSpeedGain: 0.08,     // 次の周で速くする量。0なら毎周同じ速さ
  lapSpeedMax: 0.45,     // 周回による速さの上乗せ上限
  steerAccel: 75,        // 左右にうごく加速度
  steerFriction: 0.8,    // 手をはなしたときの減速 (0〜1、小さいほどすぐ止まる)
  steerMax: 9,           // 左右移動の最高速度
  roadWidth: 9.6,         // JA香川県 豊島支店前の県道に近い道路幅
  laneSpacing: 3.2,       // 3つの走行位置を、現地の幅へ収める
  lives: 0,               // 今回は走る動きを主役にするため、ライフ制なし
  obstacleDensity: 0,     // 障害物なし。景色とカービングへ集中する
  obstacleSpacing: [16, 30], // 教材で障害物を復活させる場合の候補間隔
  jacketColor: 0x4aa8e8,  // パーカーの色 (0xRRGGBB)
  boardColor: 0xe07a2e,   // スケボーの色
  slopeRate: 0.24,        // 坂の基本勾配（約13.5度）
  slopeWave: 0.06,        // 坂のうねり。大きくすると上下の変化が増える
  slopeWaveLength: 230,   // 縦カーブ1つ分の長さ
  startSlopeRate: 0.2,   // 最初から海を見下ろす下り坂にする
  slopeRampLength: 45,   // この距離をかけて本来の急勾配へ移る
  finishFlattenLength: 145, // 港の駐車場へ入る手前から坂をなだらかにする
  finishSlopeRate: 0.018, // ゴール地点はほぼ平ら（海へ飛び出さない）
  poseBlendTime: 0.18,    // 体が操作の方向へなじむ時間（秒）
  riderLean: 0.32,       // 左右へ曲がるときの体の傾き。0.2で小さく、0.4で大きく
  cameraBank: 0,          // 0なら水平線を左右に傾けない
  routeBank: 0,           // 0なら大カーブでも水平線を水平に保つ
  cameraFovBoost: 2,      // 走りだしたときの画角のひろがり
  cameraShake: 0,         // 標準は振動なし。0.008で細かな振動を試せる
  hitShake: 0.38,         // ぶつかったときのカメラゆれ
  cameraHeight: 4.6,     // カメラを高くして、手前の路面を広く見せる
  cameraBack: 8.5,        // プレイヤーから後ろへ離す距離
  cameraLookAhead: 26,    // 坂の先を見る距離
  cameraLookLift: 1.9,   // 注視点を上げ、プレイヤーを画面下側に置く
  windParticles: innerWidth < 700 ? 42 : 76,
  edgeSoftZone: 0.8,      // 道のはしで減速しはじめる幅
  edgeSpring: 46,         // 道の端で外向きの動きを弱める力
  edgeDamping: 0.78,      // 道のはしで横すべりを弱める量
  slopeBlendLength: 34,   // 区間ごとの勾配を、この距離でなめらかにつなぐ
  crestLift: 0.45,         // 坂の頂上でカメラを少し持ち上げる量
  crestLookAhead: 3,      // 頂上で注視点をさらに遠くへ送る距離
  steepFovBoost: 2.4,       // 急な下りで画角をひろげる量
  poleSpacing: 38,        // 電柱をたてる間隔
  guidePostSpacing: 7,    // 大カーブの黄色ポールの間隔
  raftCount: 9,           // 海にうかぶ養殖いかだの数
  ridgeLayers: 3,         // 対岸の山なみのレイヤー数
  waterClearness: 1,      // 海のすきとおり具合。2で底までくっきり、0.4でにごった海
  groundTileSize: 30,     // 地面の絵1枚が覆う広さ（ユニット）。大きいほど筆づかいが大きく出る
  sceneryViewDistance: 480, // 追加した絵は近い区間だけ描画する
  harborRunout: 150,      // ゴールの先に残す陸地。海までの安全な余白
  harborWidth: 160,       // 港の駐車場全体の幅
  balancePeriod: 3.8,     // 直進中に左右へ重心を取り直す周期（秒）
  balanceSway: 0.012,     // 直進時の小さな体の揺れ
};

/* ------------------------- 2. COURSE ★かえてみよう -------------------------
   curve:    カーブの角度（プラスで右カーブ、マイナスで左カーブ、単位は度）
   length:   そのカーブの長さ
   slope:    その区間の坂のきつさ（省略すると CONFIG.slopeRate）
   bigCurve: true にすると「速度落せ」の路面文字と標識セットが手前に出る
   ぜんぶ curve: 0 にすると まっすぐな坂道になる                            */
const COURSE = [
  /* 豊島をモチーフにした演出用コース。
     海を見下ろす直線 → 大きな右カーブ → オリーブ畑 → 港へ。 */
  { curve: 0,    length: 48,  slope: 0.20 },
  { curve: 0,    length: 92,  slope: 0.24 },  // スタート直後から正面の海へ落ちる
  { curve: 112,  length: 190, slope: 0.25, bigCurve: true, photoCurve: true }, // ★半径約97の明瞭な右大カーブ
  { curve: 18,   length: 142, slope: 0.19 },  // 海を左前に見ながら斜面を横切る
  { curve: -24,  length: 132, slope: 0.20 },
  { curve: 44,   length: 176, slope: 0.22 },  // オリーブ畑のゆるい右カーブ
  { curve: -32,  length: 148, slope: 0.18 },
  { curve: 16,   length: 116, slope: 0.12 },
  { curve: 0,    length: 224, slope: 0.05 },  // 海ぎわの港へまっすぐ入る
];
