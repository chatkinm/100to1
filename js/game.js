/**
 * Логика игрового процесса "Сто к одному"
 */
import { sound } from './sound.js';

export class GameEngine {
  constructor() {
    this.pack = null;
    this.mode = 'teams'; // 'teams' или 'players'
    this.teams = [
      { name: 'Команда 1', score: 0 },
      { name: 'Команда 2', score: 0 }
    ];
    this.players = []; // Для режима "Каждый сам за себя"
    this.activeTeamIndex = 0; // 0 или 1
    this.currentRoundIdx = 0;
    
    // Текущий раунд
    this.roundData = null;
    this.answersState = []; // [{ text, points, revealed: boolean }]
    this.roundBank = 0;
    this.strikes = 0; // 0, 1, 2, 3
    
    // Большая игра
    this.bigGameState = null;
    
    // Коллбеки обновления UI
    this.onStateChange = null;
    this.onStrikeTriggered = null;
    this.onRoundCompleted = null;
    this.onGameOver = null;
  }

  /**
   * Инициализация новой игры
   */
  startNewGame(pack, options = {}) {
    this.pack = pack;
    this.mode = options.mode || 'teams';
    
    if (this.mode === 'teams') {
      this.teams = [
        { name: options.team1Name?.trim() || 'Команда 1', score: 0 },
        { name: options.team2Name?.trim() || 'Команда 2', score: 0 }
      ];
    } else {
      this.players = (options.players || ['Игрок 1', 'Игрок 2']).map(name => ({
        name,
        score: 0
      }));
    }

    this.activeTeamIndex = 0;
    this.currentRoundIdx = 0;
    this.loadRound(0);
  }

  /**
   * Загрузить раунд по индексу
   */
  loadRound(idx) {
    if (!this.pack || !this.pack.rounds || idx >= this.pack.rounds.length) {
      if (this.onGameOver) this.onGameOver();
      return;
    }

    this.currentRoundIdx = idx;
    const round = this.pack.rounds[idx];
    this.roundData = round;
    this.roundBank = 0;
    this.strikes = 0;

    if (round.isFinal) {
      // Инициализация Большой игры
      this.initBigGame(round);
    } else {
      this.answersState = (round.answers || []).map(ans => ({
        text: ans.text,
        points: Number(ans.points) || 0,
        revealed: false
      }));
      this.bigGameState = null;
    }

    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Открыть вариант ответа по индексу
   */
  revealAnswer(idx) {
    if (!this.answersState[idx] || this.answersState[idx].revealed) {
      return;
    }

    const item = this.answersState[idx];
    item.revealed = true;

    // Расчет очков с учетом множителя раунда
    const multiplier = this.roundData.isReverse ? 1 : (this.roundData.multiplier || 1);
    const addedPoints = item.points * multiplier;
    this.roundBank += addedPoints;

    sound.playOpen();

    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Добавить промах (ошибку)
   */
  addStrike() {
    if (this.strikes < 3) {
      this.strikes++;
      sound.playStrike(this.strikes);
      
      if (this.onStrikeTriggered) {
        this.onStrikeTriggered(this.strikes);
      }
      
      if (this.onStateChange) this.onStateChange();
    }
  }

  /**
   * Сбросить промахи
   */
  clearStrikes() {
    this.strikes = 0;
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Переключить активную команду
   */
  toggleActiveTeam() {
    this.activeTeamIndex = this.activeTeamIndex === 0 ? 1 : 0;
    this.clearStrikes();
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Установить активную команду напрямую
   */
  setActiveTeam(index) {
    this.activeTeamIndex = index;
    this.clearStrikes();
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Начислить банк раунда команде (или игроку)
   */
  awardBankToTeam(teamIdx) {
    if (this.mode === 'teams' && this.teams[teamIdx]) {
      this.teams[teamIdx].score += this.roundBank;
    } else if (this.mode === 'players' && this.players[teamIdx]) {
      this.players[teamIdx].score += this.roundBank;
    }

    sound.playRoundWin();
    this.roundBank = 0;

    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Открыть все скрытые ответы без начисления в банк
   */
  revealAll() {
    this.answersState.forEach(ans => {
      ans.revealed = true;
    });
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Ручная корректировка счета
   */
  adjustScore(teamIdx, delta) {
    if (this.mode === 'teams' && this.teams[teamIdx]) {
      this.teams[teamIdx].score = Math.max(0, this.teams[teamIdx].score + delta);
    } else if (this.mode === 'players' && this.players[teamIdx]) {
      this.players[teamIdx].score = Math.max(0, this.players[teamIdx].score + delta);
    }
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Ручная корректировка банка
   */
  adjustBank(delta) {
    this.roundBank = Math.max(0, this.roundBank + delta);
    if (this.onStateChange) this.onStateChange();
  }

  /**
   * Переход к следующему раунду
   */
  nextRound() {
    if (this.currentRoundIdx + 1 < this.pack.rounds.length) {
      this.loadRound(this.currentRoundIdx + 1);
    } else {
      if (this.onGameOver) this.onGameOver();
    }
  }

  /**
   * Переход к предыдущему раунду
   */
  prevRound() {
    if (this.currentRoundIdx > 0) {
      this.loadRound(this.currentRoundIdx - 1);
    }
  }

  // =================== БОЛЬШАЯ ИГРА ===================

  initBigGame(round) {
    const questions = round.finalQuestions || [];
    this.bigGameState = {
      questions: questions.map(q => ({
        question: q.question,
        answers: q.answers || [],
        player1Answer: '',
        player1Points: 0,
        player1Revealed: false,
        player2Answer: '',
        player2Points: 0,
        player2Revealed: false
      })),
      stage: 1, // 1 = игрок 1 (15 сек), 2 = игрок 2 (20 сек), 3 = подсчет и финал
      timer: 15,
      timerRunning: false,
      totalPoints: 0
    };
  }

  setBigGameAnswer(qIdx, playerNum, answerText, points = 0) {
    if (!this.bigGameState || !this.bigGameState.questions[qIdx]) return;
    const q = this.bigGameState.questions[qIdx];
    if (playerNum === 1) {
      q.player1Answer = answerText;
      q.player1Points = points;
    } else {
      q.player2Answer = answerText;
      q.player2Points = points;
    }
    this.updateBigGameTotal();
  }

  revealBigGameAnswer(qIdx, playerNum) {
    if (!this.bigGameState || !this.bigGameState.questions[qIdx]) return;
    const q = this.bigGameState.questions[qIdx];
    if (playerNum === 1) {
      q.player1Revealed = true;
    } else {
      q.player2Revealed = true;
    }
    sound.playOpen();
    this.updateBigGameTotal();
  }

  updateBigGameTotal() {
    if (!this.bigGameState) return;
    let total = 0;
    this.bigGameState.questions.forEach(q => {
      if (q.player1Revealed) total += (q.player1Points || 0);
      if (q.player2Revealed) total += (q.player2Points || 0);
    });
    this.bigGameState.totalPoints = total;
    if (this.onStateChange) this.onStateChange();
  }
}
