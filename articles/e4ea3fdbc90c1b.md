---
title: "魚のためのクソ音楽プレイヤーを作った"
emoji: "🐟"
type: "idea" # tech: 技術記事 / idea: アイデア
topics: ["Javascript", "TypeScript", "vue", "WebAudioAPI", "frontend"]
published: true
published_at: 2023-12-21 00:01
---

この記事は[クソアプリ Advent Calendar 2023](https://qiita.com/advent-calendar/2023/kuso-app) の21日目の記事です。

# はじめに

みなさんは魚に音楽を聞かせたいと思った事はあるでしょうか？
わたしはありません。

という事で作ってみました。

# 作ったもの

楽曲を特定の魚のためだけに特化して再生できるアプリケーションです。
https://fish-beat.homisoftware.net
![](/images/e4ea3fdbc90c1b/1.png)

# 使い方

1. 楽曲選択
2. 動物を選択
3. 再生ボタンを押す
4. 端末の音量を「`15倍`」にする

https://youtu.be/PLTEZnu7Mls?si=DYh3Ibywv2QvnILw
個人的にブリの音が好きです。

# 魚の音の聞こえ方

多くの魚たちは2~3000hzの範囲でしか音が聞こえません。
また魚によって周波数毎のdb感度が違ったりします。
金魚とブリを例に上げると、金魚は100hzの周波数を90dbで聞きとれますが、ブリは110dbでないと聞き取れません。
それと比べて人間の耳は高性能で、20hz~20000hzの範囲を聞き取る事ができ、100~10000hzの周波数を50db以下で聞き取る事ができます。

図で表すとこんな感じになります。
![](/images/e4ea3fdbc90c1b/2.png)

# このアプリでしていること

人間と魚の音の聞こえ方の差をとり、その差を増幅させたりしています。
楽曲は人間ベースなので、その差を埋めてしまえば、たぶん魚好みの音になるのかなあと。
エフェクターみたいな物だと思えばわかりやすいと思います。

# 実装

楽曲をWebAudioAPIで読み込ませ、魚毎に用意したBiquadFilterNodeで音を加工して再生しています。

## 金魚に最適化した音を作る

まず、人間と金魚の周波数毎でギリギリ聞き取れるdb一覧を作成します。

```tsx
const reactionFrequencyAnimals = {
    name: '人間',
    auditoryPressure: [
      { frequency: 100, db: 50 },
      { frequency: 200, db: 40 },
      { frequency: 300, db: 35 },
      { frequency: 400, db: 32 },
      { frequency: 500, db: 30 },
      { frequency: 600, db: 29 },
      { frequency: 700, db: 29 },
      { frequency: 800, db: 28 },
      { frequency: 900, db: 28 },
      { frequency: 1000, db: 28 },
      { frequency: 2000, db: 26 },
      { frequency: 3000, db: 18 },
      { frequency: 4000, db: 28 },
      { frequency: 5000, db: 31 },
      { frequency: 6000, db: 34 },
      { frequency: 7000, db: 38 },
      { frequency: 8000, db: 42 },
      { frequency: 9000, db: 45 }
    ]
  },
  {
    name: '金魚',
    auditoryPressure: [
      { frequency: 100, db: 88 },
      { frequency: 200, db: 72 },
      { frequency: 300, db: 69 },
      { frequency: 400, db: 62 },
      { frequency: 500, db: 62 },
      { frequency: 600, db: 62 },
      { frequency: 700, db: 62 },
      { frequency: 800, db: 62 },
      { frequency: 900, db: 62 },
      { frequency: 1000, db: 63 },
      { frequency: 2000, db: 80 },
      { frequency: 3000, db: 95 },
      { frequency: 4000, db: 115 }
    ]
  },
```

再生する音源は人間ベースなので金魚には聞き取れない周波数が含まれています。
金魚は100~4000hzの範囲でしか聞き取れないので、不用な周波数をカットするフィルターを作成します。

```tsx
const targetAnimal = "金魚";
// 人間のプリセットを取得
const humanReaction = reactionFrequencyAnimals.find(
  (animal) => animal.name === "人間"
);
// 金魚のプリセットを取得
const targetReaction = reactionFrequencyAnimals.find(
  (animal) => animal.name === targetAnimal
);
// 金魚が聞き取れる最小周波数を取得
const minFrequency = targetReaction.auditoryPressure.reduce((prev, current) =>
  prev.frequency < current.frequency ? prev : current
).frequency;
// 金魚が聞き取れる最大周波数を取得
const maxFrequency = targetReaction.auditoryPressure.reduce((prev, current) =>
  prev.frequency > current.frequency ? prev : current
).frequency;

// 金魚用の最小周波数~最大周波数を切り出すフィルターを作成する。
const biquadFilter = this._audioContext.createBiquadFilter();
biquadFilter.type = "bandpass";
const centerFrequency = Math.sqrt(minFrequency * maxFrequency);
const QValue = centerFrequency / (maxFrequency - minFrequency);
biquadFilter.frequency.value = centerFrequency;
biquadFilter.Q.value = QValue;
// フィルターを紐付ける
this._gainNode.connect(biquadFilter);
```

次に、音量を調整するためのフィルターを作成します。
金魚は人間と比べると耳が悪く、60db以上でないと聞き取れません。
また、周波数毎に聞き取れるdbも違っているため、調整する必要があります。
楽曲は人間ベースで作られています。なので、周波数毎の人間と金魚のdb差を求め、楽曲の周波数毎の音量を増加するようにしました。

```tsx
let lastNode = biquadFilter
for (const filterConfig of targetReaction.auditoryPressure) {
  const filter = this._audioContext.createBiquadFilter()
  // 金魚の周波数と一致する人間の周波数を取り出す。
  const humanAuditoryPressure = humanReaction.auditoryPressure.find(
    (human) => human.frequency === filterConfig.frequency
  )
	// 金魚db - 人間dbの差をゲインに変換。
  const gain = calculateSoundPressureLevelGain(humanAuditoryPressure.db, filterConfig.db)
  // そのままの値を使うと音量を30倍~7000倍あげてしまうので音が壊れない範囲に調整する(120倍以上は諦める)
  const adjustedGain = (gain / 15) < 8 : (gain / 15) : 8
  filter.type = 'peaking'
  filter.frequency.value = filterConfig.frequency
  filter.gain.value = adjustedGain
	// フィルターに紐付ける。
  lastNode.connect(filter)
  lastNode = filter
}
// フィルターとスピーカーを紐付ける
lastNode.connect(this._audioContext.destination)
```

## かなしかった事

金魚の耳が悪すぎるせいで、アプリ制御だけで最適な音量に調整できませんでした。
金魚に最適化するためには最低でも音量を30倍以上増幅させる必要があり、単純に30倍してしまうと音がつぶれてしまうのでどうしようもありませんでした。
なので実装では、元の値を15で割った値で増幅させています。
そのためユーザーには「`ホスト端末の音量を15倍にする作業`」してもらう必要があり、ホストに頼りきったクソを通り越すクソクソアプリになってしまいました。

## 悪い事を思いついた

Web Audio Apiのゲインの最大値は1541なので、単純に1541倍まで増幅できるらしい。
なので、1541倍した音をユーザー操作に紐づけて再生させたら、ユーザーのスピーカーをぶっ壊す事ができるのではと思いました。
ひよって400倍でためしたらブラウザが止めてくれました。やさしい。
@[tweet](https://twitter.com/ritoweb0321/status/1732567921778655307?s=20)
100倍なら再生できましたが、ホスト音量2では考えられない音量だったのでスピーカーに負荷はかかってそう。

# おわりに

はじめてのクソアプリ制作でした。
まったく価値のないアプリで悩んでいる時間がよくわからなくて楽しかったです。

完成したコードはこちらです。
https://github.com/ritogk/fish-beat

# 参考文献

[魚の水中音感覚と釣りへの応用](https://www.jstage.jst.go.jp/article/sicejl/58/1/58_25/_pdf)
