(() => {
  const cfg = window.GOALPLAY_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("ISI_") &&
    !cfg.SUPABASE_ANON_KEY.includes("ISI_");

  const db = configured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  let session = null;
  let matches = [];
  let currentMode = "login";
  let activeMatch = null;
  let currentFilter = "all";

  const $ = id => document.getElementById(id);

  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));

  const toast = message => {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 2800);
  };

  const openModal = id => $(id).classList.remove("hidden");
  const closeModal = id => $(id).classList.add("hidden");

  const isLive = m => String(m.status || "").toLowerCase() === "live";

  const dateText = value => {
    if (!value) return "Waktu belum ditentukan";
    const d = new Date(value);
    return isNaN(d) ? esc(value) : d.toLocaleString("id-ID", {
      day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"
    });
  };

  function setMode(mode) {
    currentMode = mode;

    document.querySelectorAll(".auth-tab").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === mode);
    });

    $("authTitle").textContent = mode === "login"
      ? "Masuk ke akunmu" : "Buat akun GoalPlay";

    $("authSubtitle").textContent = mode === "login"
      ? "Lanjutkan pengalaman sepak bolamu."
      : "Daftar gratis untuk menyimpan favorit dan ikut berdiskusi.";

    $("authSubmit").textContent = mode === "login"
      ? "Masuk" : "Daftar sekarang";

    $("nameLabel").classList.toggle("hidden", mode !== "signup");
    $("password").autocomplete = mode === "login"
      ? "current-password" : "new-password";

    $("authMessage").textContent = "";
  }

  function askLogin(feature) {
    toast(`${feature} hanya tersedia setelah login.`);
    setMode("login");
    openModal("authModal");
  }

  function updateHeader() {
    $("loginBtn").classList.toggle("hidden", !!session);
    $("signupBtn").classList.toggle("hidden", !!session);
    $("userBtn").classList.toggle("hidden", !session);

    if (session) {
      $("userBtn").textContent = (
        session.user.user_metadata?.display_name ||
        session.user.email || "Akun"
      ).split("@")[0];
    }
  }

  function matchCard(m) {
    const live = isLive(m);
    const status = live ? "LIVE" :
      (m.status === "finished" ? "SELESAI" : "AKAN DATANG");

    return `
      <article class="match-card" data-match="${esc(m.id)}">
        <div class="match-top">
          <span>${esc(m.competition || "Pertandingan")}</span>
          <span class="status ${live ? "live" : ""}">${status}</span>
        </div>

        <div class="teams">
          <div class="team">
            <div class="team-badge">${esc(m.home_emoji || "⚽")}</div>
            ${esc(m.home_team)}
          </div>

          <div class="versus">
            ${m.home_score != null && m.away_score != null
              ? `${esc(m.home_score)} : ${esc(m.away_score)}`
              : "VS"}
          </div>

          <div class="team">
            <div class="team-badge">${esc(m.away_emoji || "⚽")}</div>
            ${esc(m.away_team)}
          </div>
        </div>

        <div class="match-bottom">
          <span>${dateText(m.kickoff_at)}</span>
          <b>Lihat detail →</b>
        </div>
      </article>`;
  }

  function renderMatches() {
    const filtered = matches.filter(m =>
      currentFilter === "all" ||
      (currentFilter === "live" ? isLive(m) :
      (!isLive(m) && m.status !== "finished"))
    );

    $("matchGrid").innerHTML = filtered.length
      ? filtered.map(matchCard).join("")
      : `<div class="empty-state">Belum ada pertandingan untuk filter ini.</div>`;

    document.querySelectorAll(".match-card").forEach(card => {
      card.addEventListener("click", () => showMatch(card.dataset.match));
    });
  }

  async function loadMatches() {
    if (!db) {
      matches = sampleMatches();
      $("matchGrid").innerHTML = matches.map(matchCard).join("");

      document.querySelectorAll(".match-card").forEach(card => {
        card.addEventListener("click", () => showMatch(card.dataset.match));
      });
      return;
    }

    const { data, error } = await db.from("matches")
      .select("*")
      .order("kickoff_at", { ascending:true })
      .limit(60);

    if (error) {
      console.error(error);
      $("matchGrid").innerHTML =
        '<div class="empty-state">Data pertandingan belum tersedia. Admin perlu menambahkan data di Supabase.</div>';
      return;
    }

    matches = data || [];
    renderMatches();
  }

  function sampleMatches() {
    return [
      {
        id:"demo-1",
        competition:"CONTOH • PREMIER LEAGUE",
        home_team:"North London",
        away_team:"Manchester",
        home_emoji:"🔴",
        away_emoji:"🔵",
        status:"upcoming",
        kickoff_at:"2026-11-08T20:00:00+07:00",
        description:"Kartu contoh, bukan jadwal resmi."
      },
      {
        id:"demo-2",
        competition:"CONTOH • LIGA INDONESIA",
        home_team:"Garuda FC",
        away_team:"Banteng United",
        home_emoji:"🦅",
        away_emoji:"🐂",
        status:"upcoming",
        kickoff_at:"2026-11-09T19:00:00+07:00",
        description:"Kartu contoh, bukan jadwal resmi."
      },
      {
        id:"demo-3",
        competition:"CONTOH • UEFA",
        home_team:"Royal Club",
        away_team:"Blue Stars",
        home_emoji:"⚪",
        away_emoji:"⭐",
        status:"live",
        kickoff_at:"2026-11-04T21:00:00+07:00",
        home_score:1,
        away_score:0,
        description:"Status live hanya contoh tampilan."
      }
    ];
  }

  async function showMatch(id) {
    activeMatch = matches.find(m => String(m.id) === String(id));
    if (!activeMatch) return;

    const m = activeMatch;
    const demo = String(m.id).startsWith("demo-");

    const safeStream = m.stream_url &&
      /^https:\/\//i.test(m.stream_url) ? m.stream_url : "";

    const player = safeStream
      ? (m.stream_type === "video"
        ? `<video controls playsinline src="${esc(safeStream)}"></video>`
        : `<iframe src="${esc(safeStream)}"
             title="Pemutar siaran resmi"
             allow="autoplay; fullscreen; picture-in-picture"
             allowfullscreen
             referrerpolicy="strict-origin-when-cross-origin"></iframe>`)
      : `<div class="video-placeholder">
           <div style="font-size:34px">▶</div>
           <b>${demo ? "Tampilan demo" : "Siaran belum tersedia"}</b>
           <span>${demo
             ? "Ini kartu contoh, belum ada siaran."
             : "Admin belum menambahkan tautan siaran resmi."}</span>
         </div>`;

    $("matchDetail").innerHTML = `
      <p class="detail-league">${esc(m.competition || "Pertandingan")}</p>

      <div class="detail-teams">
        <div class="detail-team">
          <span>${esc(m.home_emoji || "⚽")}</span>
          ${esc(m.home_team)}
        </div>

        <div class="detail-versus">
          ${m.home_score != null && m.away_score != null
            ? `${esc(m.home_score)} : ${esc(m.away_score)}`
            : "VS"}
        </div>

        <div class="detail-team">
          <span>${esc(m.away_emoji || "⚽")}</span>
          ${esc(m.away_team)}
        </div>
      </div>

      <p class="detail-meta">
        ${dateText(m.kickoff_at)} • ${esc(m.status || "upcoming").toUpperCase()}
      </p>

      <div class="video-box">${player}</div>

      <div class="detail-actions">
        <button class="btn btn-outline" id="favoriteBtn">☆ Simpan favorit</button>
        <button class="btn btn-primary" id="shareBtn">Bagikan pertandingan</button>
      </div>

      <div class="comments">
        <h3>Diskusi pertandingan</h3>
        <div id="commentList" class="comment-list">Memuat komentar…</div>

        <form id="commentForm" class="comment-form">
          <input id="commentInput" maxlength="500"
            placeholder="${session ? "Tulis komentar…" : "Login untuk ikut berkomentar"}">
          <button class="btn btn-primary" type="submit">Kirim</button>
        </form>
      </div>`;

    openModal("matchModal");

    $("favoriteBtn").addEventListener("click", () => toggleFavorite(m.id));

    $("shareBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(
          location.href.split("#")[0] + `#match-${m.id}`
        );
        toast("Tautan pertandingan disalin.");
      } catch {
        toast("Tidak dapat menyalin tautan di browser ini.");
      }
    });

    $("commentForm").addEventListener("submit", postComment);

    await refreshFavoriteButton(m.id);
    await loadComments(m.id);
  }

  async function refreshFavoriteButton(matchId) {
    const btn = $("favoriteBtn");
    if (!btn) return;

    if (!session || !db) {
      btn.textContent = "☆ Simpan favorit";
      return;
    }

    const { data } = await db.from("favorites")
      .select("id")
      .eq("match_id", matchId)
      .maybeSingle();

    btn.textContent = data ? "★ Tersimpan" : "☆ Simpan favorit";
  }

  async function toggleFavorite(matchId) {
    if (!session) {
      askLogin("Favorit");
      return;
    }

    if (!db) {
      toast("Hubungkan Supabase untuk menyimpan favorit.");
      return;
    }

    const { data } = await db.from("favorites")
      .select("id")
      .eq("match_id", matchId)
      .maybeSingle();

    let result;

    if (data) {
      result = await db.from("favorites").delete().eq("id", data.id);
    } else {
      result = await db.from("favorites").insert({
        match_id:matchId,
        user_id:session.user.id
      });
    }

    if (result.error) {
      toast(result.error.message);
      return;
    }

    await refreshFavoriteButton(matchId);
    toast(data ? "Dihapus dari favorit." : "Ditambahkan ke favorit.");
  }

  async function loadComments(matchId) {
    const target = $("commentList");
    if (!target) return;

    if (!db) {
      target.textContent = "Komentar akan aktif setelah Supabase dikonfigurasi.";
      return;
    }

    const { data, error } = await db.from("comments")
      .select("id,body,created_at,user_id")
      .eq("match_id", matchId)
      .order("created_at", { ascending:false })
      .limit(30);

    if (error) {
      target.textContent = "Komentar belum tersedia.";
      return;
    }

    if (!data?.length) {
      target.textContent = "Belum ada komentar. Jadilah yang pertama!";
      return;
    }

    target.innerHTML = data.map(c => `
      <div class="comment">
        <b>${c.user_id === session?.user.id ? "Kamu" : "Member"}</b>
        ${esc(c.body)}
      </div>
    `).join("");
  }

  async function postComment(event) {
    event.preventDefault();

    if (!session) {
      askLogin("Komentar");
      return;
    }

    if (!db) {
      toast("Hubungkan Supabase terlebih dahulu.");
      return;
    }

    const input = $("commentInput");
    const body = input.value.trim();
    if (!body) return;

    const { error } = await db.from("comments").insert({
      match_id:activeMatch.id,
      user_id:session.user.id,
      body
    });

    if (error) {
      toast(error.message);
      return;
    }

    input.value = "";
    await loadComments(activeMatch.id);
    toast("Komentar terkirim.");
  }

  async function openAccount() {
    if (!session) {
      askLogin("Area member");
      return;
    }

    $("accountEmail").textContent = session.user.email || "";
    openModal("accountModal");

    if (!db) {
      $("favoriteList").textContent =
        "Hubungkan Supabase untuk mengaktifkan favorit.";
      return;
    }

    const { data, error } = await db.from("favorites")
      .select("match_id,matches(home_team,away_team,competition)")
      .eq("user_id", session.user.id);

    if (error) {
      $("favoriteList").textContent = "Tidak dapat memuat favorit.";
      return;
    }

    $("favCount").textContent = data.length;

    $("favoriteList").innerHTML = data.length
      ? data.map(f => `
          <div class="favorite-row">
            <span>${esc(f.matches?.home_team || "Pertandingan")} vs ${esc(f.matches?.away_team || "")}</span>
            <small>${esc(f.matches?.competition || "")}</small>
          </div>
        `).join("")
      : "Belum ada pertandingan favorit.";
  }

  async function handleAuth(event) {
    event.preventDefault();

    if (!db) {
      $("authMessage").textContent =
        "Supabase belum dikonfigurasi. Ikuti panduan setup.";
      return;
    }

    const email = $("email").value.trim();
    const password = $("password").value;

    $("authSubmit").disabled = true;
    $("authSubmit").textContent = "Memproses…";

    try {
      if (currentMode === "signup") {
        const display_name = $("displayName").value.trim();

        const { data, error } = await db.auth.signUp({
          email,
          password,
          options:{ data:{ display_name } }
        });

        if (error) throw error;

        $("authMessage").style.color = "#55d99a";
        $("authMessage").textContent = data.session
          ? "Akun berhasil dibuat. Kamu sudah masuk."
          : "Pendaftaran berhasil. Cek email untuk verifikasi sebelum login.";

        if (data.session) {
          session = data.session;
          updateHeader();
          setTimeout(() => closeModal("authModal"), 900);
        }
      } else {
        const { data, error } = await db.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        session = data.session;
        updateHeader();
        closeModal("authModal");
        toast("Berhasil masuk. Selamat datang!");
      }
    } catch (error) {
      $("authMessage").style.color = "#ff8190";
      $("authMessage").textContent = error.message || "Terjadi kesalahan.";
    } finally {
      $("authSubmit").disabled = false;
      $("authSubmit").textContent =
        currentMode === "login" ? "Masuk" : "Daftar sekarang";
    }
  }

  async function init() {
    $("year").textContent = new Date().getFullYear();

    $("loginBtn").onclick = () => {
      setMode("login");
      openModal("authModal");
    };

    $("signupBtn").onclick = () => {
      setMode("signup");
      openModal("authModal");
    };

    $("heroLogin").onclick = $("promoSignup").onclick = () => {
      setMode("signup");
      openModal("authModal");
    };

    $("userBtn").onclick = openAccount;
    $("memberAreaBtn").onclick = openAccount;

    $("authForm").addEventListener("submit", handleAuth);

    document.querySelectorAll(".auth-tab").forEach(b => {
      b.onclick = () => setMode(b.dataset.mode);
    });

    document.querySelectorAll("[data-close]").forEach(b => {
      b.onclick = () => closeModal(b.dataset.close);
    });

    document.querySelectorAll(".modal-backdrop").forEach(el => {
      el.addEventListener("click", e => {
        if (e.target === el) closeModal(el.id);
      });
    });

    document.querySelectorAll(".filter").forEach(b => {
      b.onclick = () => {
        currentFilter = b.dataset.filter;
        document.querySelectorAll(".filter").forEach(x => {
          x.classList.toggle("active", x === b);
        });
        renderMatches();
      };
    });

    $("logoutBtn").onclick = async () => {
      if (db) await db.auth.signOut();
      session = null;
      updateHeader();
      closeModal("accountModal");
      toast("Kamu sudah keluar.");
    };

    if (db) {
      const { data } = await db.auth.getSession();
      session = data.session;
      updateHeader();

      db.auth.onAuthStateChange((_event, newSession) => {
        session = newSession;
        updateHeader();
      });
    }

    await loadMatches();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
