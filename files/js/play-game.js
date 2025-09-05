const SUPABASE_URL = "https://ruevzmnbhoowmuleeqjb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1ZXZ6bW5iaG9vd211bGVlcWpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzOTUzNTIsImV4cCI6MjA2OTk3MTM1Mn0.tt_xEAqLGiv92mvqhQaEvsjTBE6cmYDC3kkQcyPqsTY";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let game = new Chess();
let selectedSquare = null;
let gameId = new URLSearchParams(window.location.search).get("game");
let myColor = null;
let opponentId = null;
let currentUserId = null;
let gameRow = null;

let whiteTime = 600;
let blackTime = 600;
let timerInterval = null;
globalThis.timerInterval = timerInterval;

let board = Chessboard('board', {
  position: 'start',
  pieceTheme: 'chessboard.js/img/chesspieces/bluechess.in/{piece}.png',
});

/* --- Helpers --- */
function formatTime(sec){ return `${Math.floor(sec/60)}:${(sec%60).toString().padStart(2,"0")}`; }
function updateTimers(){
  document.getElementById("topTimer").textContent = formatTime(myColor==='w'?blackTime:whiteTime);
  document.getElementById("bottomTimer").textContent = formatTime(myColor==='w'?whiteTime:blackTime);
}
function highlightActiveTimer(){
  document.getElementById("topTimer").classList.remove("active-timer");
  document.getElementById("bottomTimer").classList.remove("active-timer");
  if (game.turn()==='w'){
    (myColor==='w'?document.getElementById("bottomTimer"):document.getElementById("topTimer")).classList.add("active-timer");
  } else {
    (myColor==='b'?document.getElementById("bottomTimer"):document.getElementById("topTimer")).classList.add("active-timer");
  }
}
function startTimer(){
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{
    if (game.turn()==='w'){ whiteTime--; if (whiteTime<=0){clearInterval(timerInterval); handleTimeLoss('w');} }
    else { blackTime--; if (blackTime<=0){clearInterval(timerInterval); handleTimeLoss('b');} }
    updateTimers(); highlightActiveTimer();
  },1000);
}
async function handleTimeLoss(side){
  await supabaseClient.from("games").update({
    winner_id: side==='w'?gameRow.black_id:gameRow.white_id,
    result_reason:"time"
  }).eq("id",gameId);
}

/* --- UI Helpers --- */
function updateMoveList(){
  let moves = game.history();
  let list = document.getElementById("moveList");
  list.innerHTML="";
  moves.forEach(m=>{ let li=document.createElement("li"); li.textContent=m; list.appendChild(li); });
}
function clearHighlights(){ $('#board .square-55d63').removeClass('highlight-square possible-move'); }
function highlightSquare(sq){ $(`#board .square-${sq}`).addClass('highlight-square'); }
function highlightPossibleMoves(sq){ game.moves({square:sq,verbose:true}).forEach(m=>{$(`#board .square-${m.to}`).addClass('possible-move');}); }

async function onSquareClick(square){
  if (game.turn()!==myColor) return;
  if (selectedSquare===null){
    let piece=game.get(square);
    if (piece && piece.color===game.turn()){ selectedSquare=square; clearHighlights(); highlightSquare(square); highlightPossibleMoves(square); }
  } else {
    if (square===selectedSquare){ selectedSquare=null; clearHighlights(); return; }
    let piece=game.get(selectedSquare);
    if (piece && piece.type==='p' && ((piece.color==='w'&&square[1]==='8')||(piece.color==='b'&&square[1]==='1'))){
      showPromotionDialog(selectedSquare,square); return;
    }
    let move=game.move({from:selectedSquare,to:square});
    if (move){ board.position(game.fen()); updateMoveList(); await syncGame(); startTimer(); }
    selectedSquare=null; clearHighlights();
  }
}
function showPromotionDialog(from,to){
  let popup=document.getElementById("promotionPopup"), choices=document.getElementById("promotionChoices");
  choices.innerHTML="";
  ['q','r','b','n'].forEach(p=>{
    let img=document.createElement("img");
    img.src=`chessboard.js/img/chesspieces/bluechess.in/${game.turn()}${p.toUpperCase()}.png`;
    img.onclick=async()=>{ game.move({from,to,promotion:p}); board.position(game.fen()); updateMoveList(); popup.style.display='none'; selectedSquare=null; clearHighlights(); await syncGame(); startTimer(); };
    choices.appendChild(img);
  });
  popup.style.display='block';
}
// Offer draw
async function offerDraw() {
  await supabaseClient.from("games")
    .update({ draw_offer: currentUserId })
    .eq("id", gameId);
  alert("Draw offer sent!");
}

// Accept draw
async function acceptDraw() {
  await supabaseClient.from("games")
    .update({ winner_id: null, result_reason: "draw", draw_offer: null })
    .eq("id", gameId);
  removeDrawBanner();
}

// Decline draw
async function declineDraw() {
  await supabaseClient.from("games")
    .update({ draw_offer: null })
    .eq("id", gameId);
  removeDrawBanner();
}

function showDrawBanner() {
  if (document.getElementById("drawBanner")) return;
  const banner = document.createElement("div");
  banner.id = "drawBanner";
  banner.className = "banner";
  banner.innerHTML = `🤝 Your opponent offered a draw.
    <button onclick="acceptDraw()">Accept</button>
    <button onclick="declineDraw()">Decline</button>`;
  document.body.appendChild(banner);
}

function removeDrawBanner() {
  document.getElementById("drawBanner")?.remove();
}


/* --- Supabase Sync --- */
async function syncGame(){
  await supabaseClient.from("games").update({ fen:game.fen(), moves:game.history() }).eq("id",gameId);
  if (game.in_checkmate()){ let winner=(game.turn()==='w'?gameRow.black_id:gameRow.white_id); await supabaseClient.from("games").update({winner_id:winner,result_reason:"checkmate"}).eq("id",gameId);}
  else if (game.in_stalemate()){ await supabaseClient.from("games").update({winner_id:null,result_reason:"stalemate"}).eq("id",gameId);}
  else if (game.in_draw()||game.in_threefold_repetition()||game.insufficient_material()){ await supabaseClient.from("games").update({winner_id:null,result_reason:"draw"}).eq("id",gameId);}
}
async function resign(){ await supabaseClient.from("games").update({winner_id:opponentId,result_reason:"resignation"}).eq("id",gameId);}
function offerDraw(){ alert("Draw offered!"); }

/* --- Player Names with Avatars --- */
function addPlayerRow(container, profile, label){
  let avatarUrl = profile.profile 
      ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${profile.profile}`
      : "files/img/profiles/default-avatar.png";
  container.innerHTML = `
    <img src="${avatarUrl}" class="avatar">
    <span>${profile.username || "Unknown"} ${label}</span>
  `;
  if (profile.owner) container.innerHTML += ` <img src="files/img/badges/owner.png" class="badge">`;
  if (profile.dev) container.innerHTML += ` <img src="files/img/badges/dev.png" class="badge">`;
  if (profile.admin) container.innerHTML += ` <img src="files/img/badges/admin.png" class="badge">`;
  if (profile.coadmin) container.innerHTML += ` <img src="files/img/badges/coadmin.png" class="badge">`;
}


/* --- Live Updates --- */
function listenForGameUpdates() {
  supabaseClient.channel(`game_${gameId}`)
    .on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      payload => {
        if (payload.new.moves) {
          game.reset();
          payload.new.moves.forEach(m => game.move(m));
          board.position(game.fen());
          updateMoveList();
        }

        // 🔥 Handle draw offer inside here
        if (payload.new.draw_offer && payload.new.draw_offer !== currentUserId) {
          showDrawBanner();
        } else if (!payload.new.draw_offer) {
          removeDrawBanner();
        }

        // 🔥 Handle game end
        if (payload.new.winner_id !== null || payload.new.result_reason) {
          window.location.href = `notify.html?game=${gameId}&winner=${payload.new.winner_id}&reason=${payload.new.result_reason}`;
          return;
        }
      }
    )
    .subscribe();
}


/* --- Init --- */
(async function init(){
  const {data:{user}}=await supabaseClient.auth.getUser();
  if (!user){ window.location.href="index.html"; return; }
  currentUserId=user.id;

  const {data:gameRowData}=await supabaseClient.from("games").select("*").eq("id",gameId).single();
  gameRow=gameRowData;
  if (!gameRow){ alert("Game not found"); window.location.href="home.html"; return; }

  myColor=(user.id===gameRow.white_id)?'w':'b';
  opponentId=myColor==='w'?gameRow.black_id:gameRow.white_id;

    if (myColor === 'b') {
        board.orientation('black');
    }


  const {data:whiteProfile}=await supabaseClient.from("profiles").select("username,owner,dev,admin,coadmin,profile").eq("id",gameRow.white_id).single();
  const {data:blackProfile}=await supabaseClient.from("profiles").select("username,owner,dev,admin,coadmin,profile").eq("id",gameRow.black_id).single();

  if (myColor==='w'){
    addPlayerRow(document.getElementById("topPlayerInfo"), blackProfile, "(Black)");
    addPlayerRow(document.getElementById("bottomPlayerInfo"), whiteProfile, "(White - You)");
  } else {
    addPlayerRow(document.getElementById("topPlayerInfo"),whiteProfile,"(White)");
    addPlayerRow(document.getElementById("bottomPlayerInfo"),blackProfile,"(Black - You)");
  }

  if (gameRow.fen && gameRow.fen!=="start"){ game.load(gameRow.fen); }
  board.position(game.fen());
  updateMoveList();
  updateTimers();
  highlightActiveTimer();
  startTimer();
  listenForGameUpdates();

  $('#board').on('click','.square-55d63',function(){ onSquareClick($(this).attr('data-square')); });
})();
