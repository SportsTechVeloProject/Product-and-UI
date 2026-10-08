/* team.js — Team page, invites inbox, join requests and account settings.
   Part of V-Lo. Loaded as a plain script after auth.js; see vlo.html for the order.

   How joining works (the rules live in Supabase, this file just calls them):
   - Coach/admin invites (in-app or link)  -> the person joins straight away.
   - Athlete invites (in-app or link)      -> the person can only send a join request.
   - Team search                           -> join request.
   - Coaches/admins accept or reject join requests. */
"use strict";

var DESC_MAX = 500;

function isTeamStaff() {
  return !!(currentTeam && (currentTeam.role === "coach" || currentTeam.role === "admin"));
}

function roleLabel(role) {
  return role === "member" ? "athlete" : role;
}

// Small DOM helper: el("p", "class", "text"). Always textContent, never HTML,
// because names and descriptions are typed by users.
function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(label, className, onClick) {
  var b = el("button", className || "btn-ghost", label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function formatKg(kg) {
  return Math.round(kg).toLocaleString() + " kg";
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function debounce(fn, ms) {
  var t = null;
  return function () {
    var args = arguments;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(null, args); }, ms);
  };
}

/* ---------------- view switching ---------------- */
var teamViewEl = authEl("teamView");

function showTeamPage() {
  document.getElementById("exerciseView").hidden = true;
  document.getElementById("plansView").hidden = true;
  teamViewEl.hidden = false;
  authEl("sensorBar").hidden = true; // sensors belong to training, not the team page
  document.querySelectorAll(".apptab").forEach(function (b) { b.setAttribute("aria-selected", "false"); });
  authEl("teamBadge").setAttribute("aria-current", "page");
  window.scrollTo(0, 0);
  renderTeamPage();
}

function hideTeamPage() {
  teamViewEl.hidden = true;
  authEl("sensorBar").hidden = false;
  authEl("teamBadge").removeAttribute("aria-current");
}

authEl("teamBadge").addEventListener("click", showTeamPage);
authEl("teamBack").addEventListener("click", function (e) {
  e.preventDefault();
  renderExercise(state.ex);
});

function setTeamNotice(msg) {
  var n = authEl("teamNotice");
  n.textContent = msg || "";
  n.hidden = !msg;
}

/* ---------------- team page ---------------- */
function renderTeamPage() {
  hideProgress();
  if (authNotice) { setTeamNotice(authNotice); authNotice = ""; }

  if (!currentTeam) {
    authEl("teamEyebrow").textContent = "Team";
    authEl("teamHeading").textContent = "No team yet";
    authEl("teamMain").hidden = true;
    authEl("teamNone").hidden = false;
    var loggedIn = !!currentUser;
    authEl("teamNoneMsg").textContent = "You are not a member of a team yet, you can still work out on your own!" +
      (loggedIn ? "" : " Log in to search for a team and ask to join.");
    authEl("teamSearchCard").hidden = !loggedIn;
    return;
  }

  authEl("teamNone").hidden = true;
  authEl("teamMain").hidden = false;
  authEl("teamEyebrow").textContent = "Your team · " + roleLabel(currentTeam.role);
  authEl("teamHeading").textContent = currentTeam.teamName;
  renderDescriptions();

  var staff = isTeamStaff();
  authEl("joinRequestsCard").hidden = !staff;
  authEl("addPeopleTitle").textContent = staff ? "Add athlete" : "Suggest someone";
  authEl("addPeopleHint").textContent = staff
    ? "Find someone who has an account and invite them. They'll see the invite when they open V-Lo and can accept or decline."
    : "Know someone who should train with the team? Suggest them. They can then ask to join, and a coach or admin decides.";
  authEl("inviteRoleSelect").hidden = !staff;
  authEl("inviteRoleSelect").value = "member";

  loadTeamDetails();
  loadRoster();
  loadStats();
  loadSentInvites();
  if (staff) loadJoinRequests();
}

// Refresh name and descriptions, in case a coach edited them since we loaded.
function loadTeamDetails() {
  var teamId = currentTeam.team_id;
  sb.from("teams").select("name, public_description, private_description").eq("id", teamId).maybeSingle().then(function (res) {
    if (res.error || !res.data || !currentTeam || currentTeam.team_id !== teamId) return;
    currentTeam.teamName = res.data.name;
    currentTeam.public_description = res.data.public_description || "";
    currentTeam.private_description = res.data.private_description || "";
    authEl("teamHeading").textContent = currentTeam.teamName;
    updateTeamBadge();
    renderDescriptions();
  });
}

/* ---- descriptions ---- */
function renderDescriptions() {
  ["public_description", "private_description"].forEach(function (field) {
    var box = document.querySelector('[data-desc="' + field + '"]');
    if (box.dataset.editing === "true") return;
    box.innerHTML = "";
    var text = currentTeam[field].trim();
    var p = el("p", "team-bio" + (text ? "" : " is-empty"),
      text || (isTeamStaff() ? "Nothing here yet. Click Edit to write it." : "Nothing here yet."));
    box.appendChild(p);
    document.querySelector('[data-edit-desc="' + field + '"]').hidden = !isTeamStaff();
  });
}

function startDescEdit(field) {
  var box = document.querySelector('[data-desc="' + field + '"]');
  box.dataset.editing = "true";
  box.innerHTML = "";
  document.querySelector('[data-edit-desc="' + field + '"]').hidden = true;

  var wrap = el("div", "team-bio-editor");
  var input = el("textarea");
  input.maxLength = DESC_MAX;
  input.value = currentTeam[field];
  input.setAttribute("aria-label", field === "public_description" ? "Public description" : "Private description");
  var actions = el("div", "team-bio-actions");
  var count = el("span", "log-note");
  var status = el("p", "log-note");
  function updateCount() { count.textContent = input.value.length + " / " + DESC_MAX; }
  input.addEventListener("input", updateCount);
  updateCount();

  var cancel = button("Cancel", "btn-ghost", function () {
    delete box.dataset.editing;
    renderDescriptions();
  });
  var save = button("Save", "btn", function () {
    save.disabled = true;
    status.textContent = "Saving…";
    var patch = {};
    patch[field] = input.value.trim();
    sb.from("teams").update(patch).eq("id", currentTeam.team_id).select(field).single().then(function (res) {
      save.disabled = false;
      if (res.error) { status.textContent = "Couldn't save: " + res.error.message; return; }
      currentTeam[field] = res.data[field] || "";
      delete box.dataset.editing;
      renderDescriptions();
    });
  });
  actions.appendChild(count);
  actions.appendChild(cancel);
  actions.appendChild(save);
  wrap.appendChild(input);
  wrap.appendChild(actions);
  wrap.appendChild(status);
  box.appendChild(wrap);
  input.focus();
}

document.querySelectorAll("[data-edit-desc]").forEach(function (b) {
  b.addEventListener("click", function () { startDescEdit(b.dataset.editDesc); });
});

/* ---- people ---- */
var lastRoster = [];

function loadRoster() {
  sb.rpc("team_roster", { p_team: currentTeam.team_id }).then(function (res) {
    var coaches = authEl("coachList");
    var athletes = authEl("athleteList");
    coaches.innerHTML = "";
    athletes.innerHTML = "";
    if (res.error) { coaches.appendChild(el("li", "log-note", res.error.message)); return; }
    lastRoster = res.data || [];
    lastRoster.forEach(function (m) {
      var list = m.role === "member" ? athletes : coaches;
      list.appendChild(personRow(m));
    });
    if (!coaches.children.length) coaches.appendChild(el("li", "log-note", "No coaches yet."));
    if (!athletes.children.length) athletes.appendChild(el("li", "log-note", "No athletes yet. Add some below."));
    renderStatTiles();
  });
}

function personRow(m) {
  var li = el("li", "person-row");
  var isMe = currentUser && m.user_id === currentUser.id;
  var name = el("span", "person-name", m.full_name + (isMe ? " (you)" : ""));
  var meta = el("span", "person-meta", m.role === "admin" ? "admin" : m.role === "coach" ? "coach" : "since " + formatDate(m.joined_at));
  // Coaches/admins can open anyone's progress; everyone can open their own.
  if (isTeamStaff() || isMe) {
    var b = el("button", "person-open");
    b.type = "button";
    b.appendChild(name);
    b.appendChild(meta);
    b.appendChild(el("span", "person-arrow", "→"));
    b.setAttribute("aria-label", "Show progress for " + m.full_name);
    b.addEventListener("click", function () { showProgress(m); });
    li.appendChild(b);
  } else {
    li.appendChild(name);
    li.appendChild(meta);
  }
  return li;
}

/* ---- stats ---- */
var lastStats = [];

function loadStats() {
  sb.rpc("team_stats", { p_team: currentTeam.team_id }).then(function (res) {
    lastStats = res.error ? [] : (res.data || []);
    renderStatTiles();
  });
}

function statTile(label, value, sub) {
  var tile = el("div", "stat-tile");
  tile.appendChild(el("p", "stat-label", label));
  tile.appendChild(el("p", "stat-value", value));
  if (sub) tile.appendChild(el("p", "stat-sub", sub));
  return tile;
}

function renderStatTiles() {
  var box = authEl("teamStats");
  box.innerHTML = "";
  function count(role, one, many) {
    var n = lastRoster.filter(function (m) { return m.role === role; }).length;
    return n ? n + " " + (n === 1 ? one : many) : "";
  }
  var breakdown = [count("member", "athlete", "athletes"), count("coach", "coach", "coaches"), count("admin", "admin", "admins")]
    .filter(Boolean).join(" · ");
  box.appendChild(statTile("Players", String(lastRoster.length), breakdown));
  var totalKg = lastStats.reduce(function (sum, r) { return sum + Number(r.total_kg || 0); }, 0);
  var sessions = lastStats.reduce(function (sum, r) { return sum + r.sessions; }, 0);
  box.appendChild(statTile("Total lifted", formatKg(totalKg), sessions + " session" + (sessions === 1 ? "" : "s") + " · load × reps"));

  var speed = el("div", "stat-tile stat-tile-wide");
  speed.appendChild(el("p", "stat-label", "Average bar speed per lift"));
  var withSpeed = lastStats.filter(function (r) { return r.avg_mean_velocity !== null; });
  if (!withSpeed.length) speed.appendChild(el("p", "stat-sub", "No rep data yet."));
  withSpeed.forEach(function (r) {
    var row = el("p", "stat-row");
    row.appendChild(el("span", "", r.exercise));
    row.appendChild(el("span", "mono", Number(r.avg_mean_velocity).toFixed(2) + " m/s"));
    speed.appendChild(row);
  });
  box.appendChild(speed);
}

/* ---- one person's progress ---- */
function hideProgress() {
  authEl("athleteProgress").hidden = true;
}
authEl("progressClose").addEventListener("click", hideProgress);

function repMeanSpeed(rep) {
  var l = rep.left_mean_velocity, r = rep.right_mean_velocity;
  if (l !== null && r !== null) return (Number(l) + Number(r)) / 2;
  if (l !== null) return Number(l);
  if (r !== null) return Number(r);
  return null;
}

function showProgress(member) {
  var card = authEl("athleteProgress");
  card.hidden = false;
  authEl("progressName").textContent = member.full_name;
  authEl("progressSummary").innerHTML = "";
  authEl("progressRows").innerHTML = "";
  authEl("progressStatus").textContent = "Loading…";
  card.scrollIntoView({ behavior: "smooth", block: "start" });

  sb.from("sessions")
    .select("id, exercise, weight_kg, recorded_at, reported_rep_count, reps(left_mean_velocity, right_mean_velocity)")
    .eq("user_id", member.user_id)
    .order("recorded_at", { ascending: false })
    .then(function (res) {
      if (res.error) { authEl("progressStatus").textContent = res.error.message; return; }
      var sessions = res.data || [];
      authEl("progressStatus").textContent = sessions.length ? "" : member.full_name + " hasn't logged any sessions yet.";

      var byExercise = {};
      sessions.forEach(function (s) {
        var speeds = s.reps.map(repMeanSpeed).filter(function (v) { return v !== null; });
        s.meanSpeed = speeds.length ? speeds.reduce(function (a, b) { return a + b; }, 0) / speeds.length : null;
        s.repCount = s.reps.length || s.reported_rep_count || 0;
        (byExercise[s.exercise] = byExercise[s.exercise] || []).push(s);
      });

      // One tile per lift: heaviest load, and how bar speed moved from first to latest session.
      Object.keys(byExercise).sort().forEach(function (exercise) {
        var list = byExercise[exercise]; // newest first
        var best = Math.max.apply(null, list.map(function (s) { return Number(s.weight_kg || 0); }));
        var latest = list[0], first = list[list.length - 1];
        var sub = list.length + " session" + (list.length === 1 ? "" : "s");
        if (latest.meanSpeed !== null && first.meanSpeed !== null && list.length > 1) {
          var diff = latest.meanSpeed - first.meanSpeed;
          sub += " · speed " + (diff >= 0 ? "+" : "") + diff.toFixed(2) + " m/s since first";
        }
        authEl("progressSummary").appendChild(statTile(exercise, "Best " + formatKg(best), sub));
      });

      var rows = authEl("progressRows");
      sessions.forEach(function (s) {
        var tr = el("tr");
        tr.appendChild(el("td", "", formatDate(s.recorded_at)));
        tr.appendChild(el("td", "", s.exercise));
        tr.appendChild(el("td", "num", s.weight_kg === null ? "—" : formatKg(Number(s.weight_kg))));
        tr.appendChild(el("td", "num", String(s.repCount)));
        tr.appendChild(el("td", "num", s.meanSpeed === null ? "—" : s.meanSpeed.toFixed(2) + " m/s"));
        rows.appendChild(tr);
      });
    });
}

/* ---- join requests (coaches/admins) ---- */
function loadJoinRequests() {
  sb.from("team_join_requests")
    .select("id, created_at, invite_id, requester:profiles!team_join_requests_user_id_fkey(full_name)")
    .eq("team_id", currentTeam.team_id)
    .eq("status", "pending")
    .order("created_at")
    .then(function (res) {
      var list = authEl("joinRequestList");
      list.innerHTML = "";
      if (res.error) { list.appendChild(el("li", "log-note", res.error.message)); return; }
      if (!res.data.length) { list.appendChild(el("li", "log-note", "No requests right now.")); return; }
      res.data.forEach(function (r) {
        var li = el("li", "person-row");
        li.appendChild(el("span", "person-name", r.requester ? r.requester.full_name : "Someone"));
        li.appendChild(el("span", "person-meta", r.invite_id ? "suggested by a teammate" : "found the team in search"));
        var actions = el("span", "person-actions");
        actions.appendChild(button("Accept", "btn", function () { answerRequest(r.id, true, li); }));
        actions.appendChild(button("Reject", "btn-ghost", function () { answerRequest(r.id, false, li); }));
        li.appendChild(actions);
        list.appendChild(li);
      });
    });
}

function answerRequest(id, accept, li) {
  li.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
  sb.rpc("answer_join_request", { p_request: id, p_accept: accept }).then(function (res) {
    if (res.error) {
      li.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
      setTeamNotice(res.error.message);
      return;
    }
    loadJoinRequests();
    if (accept) { loadRoster(); loadStats(); }
  });
}

/* ---- adding people: in-app invites ---- */
var userSearchInput = authEl("userSearchInput");
var runUserSearch = debounce(function () {
  var q = userSearchInput.value.trim();
  var box = authEl("userSearchResults");
  if (q.length < 2 || !currentTeam) { box.innerHTML = ""; return; }
  sb.rpc("search_users", { q: q, p_team: currentTeam.team_id }).then(function (res) {
    if (userSearchInput.value.trim() !== q) return; // a newer search is on its way
    box.innerHTML = "";
    if (res.error) { box.appendChild(el("p", "log-note", res.error.message)); return; }
    if (!res.data.length) { box.appendChild(el("p", "log-note", "Nobody found. They need a V-Lo account first; you can send them an invite link instead.")); return; }
    res.data.forEach(function (u) {
      var row = el("div", "person-row");
      row.appendChild(el("span", "person-name", u.full_name));
      var actions = el("span", "person-actions");
      if (u.invite_pending) {
        actions.appendChild(el("span", "person-meta", "invited"));
      } else if (isTeamStaff()) {
        actions.appendChild(button("Invite as athlete", "btn-ghost", function () { inviteUser(u, "member", actions); }));
        actions.appendChild(button("Invite as coach", "btn-ghost", function () { inviteUser(u, "coach", actions); }));
      } else {
        actions.appendChild(button("Suggest", "btn-ghost", function () { inviteUser(u, "member", actions); }));
      }
      row.appendChild(actions);
      box.appendChild(row);
    });
  });
}, 250);
userSearchInput.addEventListener("input", runUserSearch);

function inviteUser(user, role, actions) {
  actions.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
  sb.rpc("invite_user", { p_team: currentTeam.team_id, p_user: user.user_id, p_role: role }).then(function (res) {
    actions.innerHTML = "";
    actions.appendChild(el("span", "person-meta", res.error ? res.error.message : (isTeamStaff() ? "invited" : "suggested")));
    if (!res.error) loadSentInvites();
  });
}

// Invites this team has sent that nobody has answered yet (staff see all, athletes their own).
function loadSentInvites() {
  sb.from("team_invites")
    .select("id, role, created_at, created_by, invitee:profiles!team_invites_invited_user_id_fkey(full_name)")
    .eq("team_id", currentTeam.team_id)
    .eq("status", "pending")
    .not("invited_user_id", "is", null)
    .order("created_at", { ascending: false })
    .then(function (res) {
      var list = authEl("sentInviteList");
      list.innerHTML = "";
      if (res.error || !res.data.length) return;
      list.appendChild(el("li", "eyebrow sent-heading", "Waiting for an answer"));
      res.data.forEach(function (inv) {
        var li = el("li", "person-row");
        li.appendChild(el("span", "person-name", inv.invitee ? inv.invitee.full_name : "Someone"));
        li.appendChild(el("span", "person-meta", "as " + roleLabel(inv.role) + " · " + formatDate(inv.created_at)));
        if (isTeamStaff() || (currentUser && inv.created_by === currentUser.id)) {
          var actions = el("span", "person-actions");
          actions.appendChild(button("Cancel", "btn-ghost", function () {
            sb.from("team_invites").delete().eq("id", inv.id).then(loadSentInvites);
          }));
          li.appendChild(actions);
        }
        list.appendChild(li);
      });
    });
}

/* ---- adding people: invite links ---- */
authEl("createInviteBtn").addEventListener("click", function () {
  if (!currentTeam) return;
  var role = isTeamStaff() ? authEl("inviteRoleSelect").value : "member";
  authEl("inviteStatus").textContent = "Creating link…";
  sb.from("team_invites").insert({ team_id: currentTeam.team_id, role: role }).select().single()
    .then(function (res) {
      if (res.error) { authEl("inviteStatus").textContent = res.error.message; return; }
      var link = window.location.origin + window.location.pathname + "?invite=" + res.data.id;
      authEl("inviteLinkRow").hidden = false;
      authEl("inviteLinkOut").value = link;
      authEl("inviteStatus").textContent = isTeamStaff()
        ? "Share it any way you like. Whoever opens it and signs up (or logs in) joins as " + (role === "member" ? "an athlete" : "a coach") + "."
        : "Share it any way you like. Whoever opens it sends a join request, and a coach or admin decides.";
    });
});
authEl("copyInviteBtn").addEventListener("click", function () {
  var input = authEl("inviteLinkOut");
  input.select();
  try { document.execCommand("copy"); authEl("inviteStatus").textContent = "Copied."; } catch (e) { /* clipboard not available */ }
});

/* ---------------- team search (when not in a team) ---------------- */
var teamSearchInput = authEl("teamSearchInput");
var runTeamSearch = debounce(function () {
  var q = teamSearchInput.value.trim();
  var box = authEl("teamSearchResults");
  if (q.length < 2) { box.innerHTML = ""; return; }
  sb.rpc("search_teams", { q: q }).then(function (res) {
    if (teamSearchInput.value.trim() !== q) return;
    box.innerHTML = "";
    if (res.error) { box.appendChild(el("p", "log-note", res.error.message)); return; }
    if (!res.data.length) { box.appendChild(el("p", "log-note", "No teams match “" + q + "”.")); return; }
    res.data.forEach(function (t) { box.appendChild(teamResult(t)); });
    // Search knows you're in a team the page hasn't loaded: reload it.
    if (!currentTeam && currentUser && res.data.some(function (t) { return t.is_member; })) {
      loadMembership(currentUser).then(function () { if (!teamViewEl.hidden) renderTeamPage(); });
    }
  });
}, 250);
teamSearchInput.addEventListener("input", runTeamSearch);

// Only what search is allowed to show: name, public description, creator, member count.
function teamResult(t) {
  var card = el("div", "team-result");
  var head = el("div", "team-result-head");
  var titles = el("div");
  titles.appendChild(el("h4", "", t.name));
  titles.appendChild(el("p", "person-meta",
    "Created by " + (t.creator_name || "unknown") + " · " + t.member_count + " member" + (t.member_count === 1 ? "" : "s")));
  head.appendChild(titles);
  var action = el("span", "person-actions");
  if (t.is_member) action.appendChild(el("span", "person-meta", "You're a member"));
  else if (t.has_pending_request) action.appendChild(el("span", "person-meta", "Request sent"));
  else action.appendChild(button("Request to join", "btn", function () {
    action.innerHTML = "";
    action.appendChild(el("span", "person-meta", "Sending…"));
    sb.rpc("request_to_join", { p_team: t.team_id }).then(function (res) {
      action.innerHTML = "";
      action.appendChild(el("span", "person-meta", res.error ? res.error.message : "Request sent"));
    });
  }));
  head.appendChild(action);
  card.appendChild(head);
  if (t.public_description) card.appendChild(el("p", "team-bio", t.public_description));
  return card;
}

/* ---------------- invites inbox (home screen) ---------------- */
function refreshInbox() {
  var inbox = authEl("inviteInbox");
  if (!sb || !currentUser) { inbox.hidden = true; setInviteCount(0); return; }
  sb.rpc("my_invites").then(function (res) {
    var list = authEl("inviteList");
    list.innerHTML = "";
    var invites = res.error ? [] : (res.data || []);
    setInviteCount(invites.length);
    inbox.hidden = !invites.length;
    invites.forEach(function (inv) { list.appendChild(inviteCard(inv)); });
  });
}

function inviteCard(inv) {
  var card = el("div", "invite-card");
  var text = el("div", "invite-text");
  // Athlete suggestions can't be accepted directly, only turned into a join request.
  text.appendChild(el("p", "invite-title", inv.needs_approval
    ? (inv.invited_by || "A teammate") + " suggested you join " + inv.team_name
    : (inv.invited_by || "A coach") + " invited you to join " + inv.team_name + " as " + (inv.role === "member" ? "an athlete" : "a coach")));
  if (inv.public_description) text.appendChild(el("p", "team-bio invite-desc", inv.public_description));
  if (inv.needs_approval) text.appendChild(el("p", "log-note", "A coach or admin of the team has to approve your request."));
  card.appendChild(text);

  var actions = el("div", "person-actions");
  function respond(action) {
    actions.querySelectorAll("button").forEach(function (b) { b.disabled = true; });
    sb.rpc("respond_to_invite", { p_invite: inv.invite_id, p_action: action }).then(function (res) {
      if (res.error) {
        actions.querySelectorAll("button").forEach(function (b) { b.disabled = false; });
        actions.appendChild(el("span", "log-note", res.error.message));
        return;
      }
      if (res.data === "joined") {
        authNotice = "Welcome to " + inv.team_name + "!";
        loadMembership(currentUser).then(showTeamPage);
      } else if (res.data === "requested") {
        authNotice = "Join request sent to " + inv.team_name + ".";
      }
      refreshInbox();
    });
  }
  if (inv.needs_approval) {
    actions.appendChild(button("Request to join team", "btn", function () { respond("request"); }));
    actions.appendChild(button("Ignore team suggestion", "btn-ghost", function () { respond("ignore"); }));
  } else {
    actions.appendChild(button("Accept", "btn", function () { respond("accept"); }));
    actions.appendChild(button("Decline", "btn-ghost", function () { respond("decline"); }));
  }
  card.appendChild(actions);
  return card;
}

/* ---------------- profile icon + account settings ---------------- */
var accountOverlayEl = authEl("accountModalOverlay");

function setInviteCount(n) {
  authEl("profileDot").hidden = n === 0;
  authEl("profileBtn").setAttribute("aria-label",
    currentUser ? "Account settings" + (n ? " (" + n + " team invite" + (n === 1 ? "" : "s") + ")" : "") : "Log in");
}

function updateProfileButton() {
  var initial = authEl("profileInitial");
  var svg = authEl("profileBtn").querySelector("svg");
  var name = currentProfile && currentProfile.full_name;
  initial.textContent = name ? name.trim().charAt(0).toUpperCase() : "";
  initial.hidden = !name;
  svg.style.display = name ? "none" : "";
  authEl("profileBtn").classList.toggle("is-logged-in", !!currentUser);
}

authEl("profileBtn").addEventListener("click", function () {
  if (!currentUser) { setAuthMode("login"); openAuthModal(); return; }
  authEl("accountEmail").textContent = currentUser.email;
  authEl("accountName").value = currentProfile ? currentProfile.full_name : "";
  authEl("accountStatus").textContent = "";
  accountOverlayEl.hidden = false;
  authEl("accountName").focus();
});

function closeAccountModal() { accountOverlayEl.hidden = true; }
authEl("accountModalClose").addEventListener("click", closeAccountModal);
var accountPressedOnBackdrop = false;
accountOverlayEl.addEventListener("mousedown", function (e) { accountPressedOnBackdrop = e.target === accountOverlayEl; });
accountOverlayEl.addEventListener("click", function (e) { if (e.target === accountOverlayEl && accountPressedOnBackdrop) closeAccountModal(); });
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && !accountOverlayEl.hidden) closeAccountModal();
});

authEl("accountForm").addEventListener("submit", function (e) {
  e.preventDefault();
  var name = authEl("accountName").value.trim();
  if (!name) { authEl("accountStatus").textContent = "Your name can't be empty."; return; }
  authEl("accountSave").disabled = true;
  authEl("accountStatus").textContent = "Saving…";
  sb.from("profiles").update({ full_name: name }).eq("id", currentUser.id).select("full_name").single().then(function (res) {
    authEl("accountSave").disabled = false;
    if (res.error) { authEl("accountStatus").textContent = "Couldn't save: " + res.error.message; return; }
    currentProfile = res.data;
    updateProfileButton();
    authEl("accountStatus").textContent = "Saved.";
    if (!teamViewEl.hidden) renderTeamPage();
  });
});

authEl("accountLogout").addEventListener("click", function () {
  closeAccountModal();
  signOut();
});

/* ---------------- called by auth.js when login or team changes ---------------- */
function onAccountChanged() {
  updateProfileButton();
  refreshInbox();
  if (!teamViewEl.hidden) renderTeamPage();
}
updateProfileButton();
setInviteCount(0);
