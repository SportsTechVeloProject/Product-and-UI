/* auth.js — Supabase accounts, teams and invites.
   Part of V-Lo. Loaded as a plain script; see vlo.html for the order. */
"use strict";

/* ---------------- accounts: login / signup / team invites ---------------- */
// Same project as the raw-session fetch above. The anon key is meant to be
// public (see the chat where this was explained) — paste your project's
// "anon public" key from Settings -> API. Access is enforced by the Row
// Level Security policies set up in Supabase, not by keeping this secret.
var SUPABASE_URL = "https://amxrrodzdvizndchfeqy.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFteHJyb2R6ZHZpem5kY2hmZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MzY2MjgsImV4cCI6MjEwNTExMjYyOH0.DK_3jMp83K1DQKW6NVaSK77UNYBtXwfamjkZ3svewO4";

// Read before createClient: Supabase strips the #...type=recovery hash once
// it has turned the password-reset link into a session.
var isRecoveryLink = /type=recovery/.test(window.location.hash);

var sb = (window.supabase && SUPABASE_ANON_KEY.indexOf("PASTE_") !== 0)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

var authMode = "login"; // "login" | "signup"
var pendingInviteId = null;
var currentTeam = null; // { team_id, role, teamName }

(function readInviteFromUrl() {
  var params = new URLSearchParams(window.location.search);
  var inv = params.get("invite");
  if (!inv) return;
  pendingInviteId = inv;
})();

function authEl(id) { return document.getElementById(id); }

function setAuthStatus(msg) { var s = authEl("authStatus"); if (s) s.textContent = msg || ""; }

function openAuthModal() {
  var overlay = authEl("authModalOverlay");
  if (!overlay) return;
  overlay.hidden = false;
  if (!sb) {
    setAuthStatus("Not connected to Supabase yet — the anon key still needs to be filled in (see the code comment near SUPABASE_ANON_KEY).");
  } else if (pendingInviteId) {
    showInvitePreview();
  }
}
function closeAuthModal() { var overlay = authEl("authModalOverlay"); if (overlay) overlay.hidden = true; hidePasswords(); }

function showInvitePreview() {
  if (!sb || !pendingInviteId) return;
  sb.from("vikt_team_invites").select("role, vikt_teams(name)").eq("id", pendingInviteId).single()
    .then(function (res) {
      var note = authEl("authInviteNote");
      if (!note) return;
      if (res.error || !res.data) {
        note.hidden = true;
        return;
      }
      note.hidden = false;
      note.textContent = "You've been invited to join " + res.data.vikt_teams.name + " as a " + res.data.role + ". Sign up or log in to accept.";
    })
    .catch(function () { /* ignore preview errors, invite is still redeemed on login/signup */ });
}

function setAuthMode(mode) {
  authMode = mode;
  authEl("authModalTitle").textContent = mode === "login" ? "Log in" : "Sign up";
  authEl("authSubmitBtn").textContent = mode === "login" ? "Log in" : "Sign up";
  authEl("authToggleText").textContent = mode === "login" ? "Don't have an account?" : "Already have an account?";
  authEl("authToggleMode").textContent = mode === "login" ? "Sign up" : "Log in";
  authEl("authForgotRow").hidden = mode !== "login";
  setAuthStatus("");
}

// Put every password field back to hidden (and its eye back to closed).
function hidePasswords() {
  document.querySelectorAll(".pw-toggle").forEach(function (btn) { setPasswordVisible(btn, false); });
}
function setPasswordVisible(btn, visible) {
  btn.parentElement.querySelector("input").type = visible ? "text" : "password";
  // SVG elements have no .hidden property, so set the attribute directly.
  btn.querySelector(".eye-open").toggleAttribute("hidden", !visible);
  btn.querySelector(".eye-closed").toggleAttribute("hidden", visible);
  btn.setAttribute("aria-pressed", visible ? "true" : "false");
  btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
}

// Shown when the visitor arrives from a "reset your password" email.
function showResetForm() {
  openAuthModal();
  setAuthStatus("");
  authEl("authModalTitle").textContent = "Set a new password";
  authEl("authForm").hidden = true;
  authEl("loggedInPanel").hidden = true;
  authEl("authResetForm").hidden = false;
  authEl("authNewPassword").focus();
}

function showLoggedIn(user) {
  authEl("authForm").hidden = true;
  var panel = authEl("loggedInPanel");
  panel.hidden = false;
  authEl("loggedInStatus").textContent = "Logged in as " + user.email + (currentTeam ? " · " + currentTeam.teamName + " · " + currentTeam.role : " · no team yet");
  var adminPanel = authEl("adminInvitePanel");
  adminPanel.hidden = !(currentTeam && (currentTeam.role === "admin" || currentTeam.role === "coach"));
  updateTeamBadge();
}

function updateTeamBadge() {
  var badge = authEl("teamBadge");
  if (!badge) return;
  badge.textContent = currentTeam ? currentTeam.teamName : "No team assigned";
}

function loadMembership(user) {
  return sb.from("vikt_team_members").select("team_id, role, vikt_teams(name)").eq("user_id", user.id).limit(1).maybeSingle()
    .then(function (res) {
      if (res.error) {
        // Surfaced so a "no team yet" caused by a query/permissions problem
        // is visible instead of silently looking like "just no membership".
        console.error("loadMembership error:", res.error);
      }
      if (res.data) {
        currentTeam = { team_id: res.data.team_id, role: res.data.role, teamName: res.data.vikt_teams.name };
      } else {
        currentTeam = null;
      }
      showLoggedIn(user);
    });
}

function onAuthed(user) {
  var goToDemo = function () {
    closeAuthModal();
    openDemo();
  };
  var afterMembership = function () {
    if (pendingInviteId) {
      sb.rpc("vikt_redeem_invite", { invite_id: pendingInviteId }).then(function (res) {
        pendingInviteId = null;
        if (!res.error) {
          // clean the ?invite= param out of the address bar
          var url = new URL(window.location.href);
          url.searchParams.delete("invite");
          window.history.replaceState({}, "", url);
        }
        loadMembership(user).then(goToDemo);
      });
    } else {
      loadMembership(user).then(goToDemo);
    }
  };
  afterMembership();
}

authEl("authToggleMode") && authEl("authToggleMode").addEventListener("click", function () {
  setAuthMode(authMode === "login" ? "signup" : "login");
});

var authFormEl = authEl("authForm");
if (authFormEl) {
  authFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!sb) { setAuthStatus("Not connected to Supabase yet."); return; }
    var email = authEl("authEmail").value.trim();
    var password = authEl("authPassword").value;
    setAuthStatus(authMode === "login" ? "Logging in…" : "Signing up…");
    var call = authMode === "login"
      ? sb.auth.signInWithPassword({ email: email, password: password })
      : sb.auth.signUp({ email: email, password: password });
    call.then(function (res) {
      if (res.error) { setAuthStatus(res.error.message); return; }
      if (!res.data.user) { setAuthStatus("Check your email to confirm your account, then log in."); return; }
      onAuthed(res.data.user);
    });
  });
}

document.querySelectorAll(".pw-toggle").forEach(function (btn) {
  btn.addEventListener("click", function () {
    setPasswordVisible(btn, btn.getAttribute("aria-pressed") !== "true");
  });
});

var authForgotBtnEl = authEl("authForgotBtn");
if (authForgotBtnEl) {
  authForgotBtnEl.addEventListener("click", function () {
    if (!sb) { setAuthStatus("Not connected to Supabase yet."); return; }
    var emailEl = authEl("authEmail");
    var email = emailEl.value.trim();
    if (!email || !emailEl.checkValidity()) {
      setAuthStatus("Type your email above, then click \u201cForgot password?\u201d again.");
      emailEl.focus();
      return;
    }
    setAuthStatus("Sending reset link\u2026");
    // The link in the email brings the visitor back to this page. A local
    // file:// page can't be a redirect target, so fall back to the Site URL
    // configured in Supabase.
    var opts = window.location.protocol === "file:" ? {} : { redirectTo: window.location.origin + window.location.pathname };
    sb.auth.resetPasswordForEmail(email, opts).then(function (res) {
      if (res.error) { setAuthStatus(res.error.message); return; }
      setAuthStatus("If there's an account for " + email + ", a reset link is on its way. Check your inbox.");
    });
  });
}

var authResetFormEl = authEl("authResetForm");
if (authResetFormEl) {
  authResetFormEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var status = authEl("authResetStatus");
    status.textContent = "Saving\u2026";
    sb.auth.updateUser({ password: authEl("authNewPassword").value }).then(function (res) {
      if (res.error) { status.textContent = res.error.message; return; }
      status.textContent = "";
      authEl("authNewPassword").value = "";
      authResetFormEl.hidden = true;
      hidePasswords();
      setAuthMode("login");
      window.history.replaceState({}, "", window.location.pathname + window.location.search);
      onAuthed(res.data.user);
    });
  });
}

var goToDemoBtnEl = authEl("goToDemoBtn");
if (goToDemoBtnEl) {
  goToDemoBtnEl.addEventListener("click", function () {
    closeAuthModal();
    openDemo();
  });
}

var logoutBtnEl = authEl("logoutBtn");
if (logoutBtnEl) {
  logoutBtnEl.addEventListener("click", function () {
    sb.auth.signOut().then(function () {
      currentTeam = null;
      updateTeamBadge();
      authEl("loggedInPanel").hidden = true;
      authEl("authForm").hidden = false;
      authEl("authEmail").value = "";
      authEl("authPassword").value = "";
      hidePasswords();
      setAuthMode("login");
    });
  });
}

var createInviteBtnEl = authEl("createInviteBtn");
if (createInviteBtnEl) {
  createInviteBtnEl.addEventListener("click", function () {
    if (!currentTeam) return;
    var role = authEl("inviteRoleSelect").value;
    authEl("inviteStatus").textContent = "Creating link…";
    sb.from("vikt_team_invites").insert({ team_id: currentTeam.team_id, role: role }).select().single()
      .then(function (res) {
        if (res.error) { authEl("inviteStatus").textContent = res.error.message; return; }
        var link = window.location.origin + window.location.pathname + "?invite=" + res.data.id;
        authEl("inviteLinkRow").hidden = false;
        authEl("inviteLinkOut").value = link;
        authEl("inviteStatus").textContent = "Share this link any way you like, email, text, chat. Anyone who opens it and signs up (or logs in) joins your team as a " + role + ".";
      });
  });
}
var copyInviteBtnEl = authEl("copyInviteBtn");
if (copyInviteBtnEl) {
  copyInviteBtnEl.addEventListener("click", function () {
    var input = authEl("inviteLinkOut");
    input.select();
    try { document.execCommand("copy"); authEl("inviteStatus").textContent = "Copied."; } catch (e) { /* clipboard not available */ }
  });
}

document.querySelectorAll(".open-auth-btn").forEach(function (b) { b.addEventListener("click", openAuthModal); });
var authModalCloseEl = authEl("authModalClose");
if (authModalCloseEl) authModalCloseEl.addEventListener("click", closeAuthModal);
var authModalOverlayEl = authEl("authModalOverlay");
if (authModalOverlayEl) {
  var authPressedOnBackdrop = false;
  authModalOverlayEl.addEventListener("mousedown", function (e) { authPressedOnBackdrop = e.target.id === "authModalOverlay"; });
  authModalOverlayEl.addEventListener("click", function (e) { if (e.target.id === "authModalOverlay" && authPressedOnBackdrop) closeAuthModal(); });
}
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && authModalOverlayEl && !authModalOverlayEl.hidden) closeAuthModal();
});

// If already logged in from a previous visit (Supabase keeps the session
// in the browser), pick that session back up automatically. Otherwise, if
// this visit came from an invite link (?invite=...), pop the auth modal
// open right away in signup mode so the invite is actually visible instead
// of silently waiting for the visitor to click "Log in" on their own.
if (sb) {
  sb.auth.onAuthStateChange(function (event) {
    if (event === "PASSWORD_RECOVERY") showResetForm();
  });
  sb.auth.getSession().then(function (res) {
    if (isRecoveryLink) {
      // Logged in by the reset link: ask for the new password first.
      showResetForm();
    } else if (res.data && res.data.session) {
      onAuthed(res.data.session.user);
    } else if (pendingInviteId) {
      setAuthMode("signup");
      openAuthModal();
    }
  });
}
