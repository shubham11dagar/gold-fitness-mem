/* ==========================================================================
   GOLD FITNESS GYM - MEMBER CLIENT ENGINE (PUBLIC)
   ========================================================================== */

const CONFIG = {
  apiUrl: "https://api.goldfitness.workers.dev/",
  pollInterval: 8000
};

const SESSION_CONFIG = {
  storageKey: "gym_member_session",
  inactivityLimitMs: 15 * 24 * 60 * 60 * 1000 // 15 Days
};

// --- GYM PRICING DATA ENGINE (Dynamic Default Fallbacks) ---
let PLAN_RATES = {
  without: {
    "1m": { price: "Loading...", sub: "", label: "✕ Treadmill Excluded", fullLabel: "1 Month (Without Treadmill)" },
    "3m": { price: "Loading...", sub: "", label: "✕ Treadmill Excluded", fullLabel: "3 Month (Without Treadmill)" },
    "6m": { price: "Loading...", sub: "", label: "✕ Treadmill Excluded", fullLabel: "6 Month (Without Treadmill)" },
    "12m": { price: "Loading...", sub: "", label: "✕ Treadmill Excluded", fullLabel: "12 Month (Without Treadmill)" }
  },
  with: {
    "1m": { price: "Loading...", sub: "", label: "✓ Includes Treadmill & Cardio", fullLabel: "1 Month (With Treadmill)" },
    "3m": { price: "Loading...", sub: "", label: "✓ Includes Treadmill & Cardio", fullLabel: "3 Month (With Treadmill)" },
    "6m": { price: "Loading...", sub: "", label: "✓ Includes Treadmill & Cardio", fullLabel: "6 Month (With Treadmill)" },
    "12m": { price: "Loading...", sub: "", label: "✓ Includes Treadmill & Cardio", fullLabel: "12 Month (With Treadmill)" }
  }
};

let currentPlanMode = "without";
let isPricingLoaded = false;

const State = {
  theme: localStorage.getItem("gym_theme") || "system",
  activeView: "auth",
  members: [],
  transactions: [],
  activeIdentifier: null,
  isFetching: false,
  timer: null
};

function dismissMobileKeyboard() {
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  setupEvents();
  setupFaqAccordion();
  startSync();
  
  // Apply "Loading..." text placeholder immediately on startup across both tabs
  showPriceLoadingState(true);
  fetchData(true); // Runs silently in the background

  const isMemberLoggedIn = checkAutoLogin();
  if (!isMemberLoggedIn) {
    switchView("auth", true);
  }
});

// --- SESSION MANAGEMENT ---
function saveMemberSession(identifier) {
  localStorage.setItem(SESSION_CONFIG.storageKey, JSON.stringify({ identifier: identifier, lastActive: Date.now() }));
}

function touchMemberSession() {
  const raw = localStorage.getItem(SESSION_CONFIG.storageKey);
  if (!raw) return;
  try {
    const session = JSON.parse(raw);
    session.lastActive = Date.now();
    localStorage.setItem(SESSION_CONFIG.storageKey, JSON.stringify(session));
  } catch (e) {
    localStorage.removeItem(SESSION_CONFIG.storageKey);
  }
}

function clearMemberSession() {
  localStorage.removeItem(SESSION_CONFIG.storageKey);
  State.activeIdentifier = null;
}

function checkAutoLogin() {
  const raw = localStorage.getItem(SESSION_CONFIG.storageKey);
  if (!raw) return false;
  try {
    const session = JSON.parse(raw);
    if (Date.now() - session.lastActive > SESSION_CONFIG.inactivityLimitMs) {
      clearMemberSession();
      showToast("Session expired after 15 days of inactivity.", true);
      return false;
    }
    touchMemberSession();
    State.activeIdentifier = session.identifier;
    switchView("member", false);
    return true;
  } catch (e) {
    clearMemberSession();
    return false;
  }
}

function handleMemberLogout() {
  dismissMobileKeyboard();
  clearMemberSession();
  const loginInput = document.getElementById("input-member-phone");
  if (loginInput) loginInput.value = "";
  setMemberLoginError("");
  switchView("auth", true);
  showToast("Logged out successfully");
}

// --- POPUP MODAL ACTIONS ---
function openMemberLoginModal() {
  dismissMobileKeyboard();
  setMemberLoginError("");
  const modal = document.getElementById("member-login-modal");
  if (modal) {
    modal.classList.remove("hidden");
    const input = document.getElementById("input-member-phone");
    if (input) setTimeout(() => input.focus(), 150);
  }
}

function closeMemberLoginModal() {
  dismissMobileKeyboard();
  setMemberLoginError("");
  const modal = document.getElementById("member-login-modal");
  if (modal) modal.classList.add("hidden");
  const input = document.getElementById("input-member-phone");
  if (input) input.value = "";
}

function openInquiryModal(planName = "") {
  dismissMobileKeyboard();
  const modal = document.getElementById("inquiry-modal");
  const notice = document.getElementById("inquiry-plan-notice");
  const planSelect = document.getElementById("inq-plan");
  
  if (planName) {
    if (planSelect) planSelect.value = planName;
    if (notice) notice.classList.remove("hidden");
    const noticeText = document.getElementById("selected-plan-text");
    if (noticeText) noticeText.innerText = `Selected: ${planName}`;
  } else {
    if (notice) notice.classList.add("hidden");
  }

  if (modal) {
    modal.classList.remove("hidden");
    const nameInput = document.getElementById("inq-name");
    if (nameInput) setTimeout(() => nameInput.focus(), 150);
  }
}

function closeInquiryModal() {
  dismissMobileKeyboard();
  const modal = document.getElementById("inquiry-modal");
  if (modal) modal.classList.add("hidden");
}

// --- UTILITIES ---
function formatDate(dateInput) {
  if (!dateInput) return "--";
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return "--";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

// Applies "Loading..." placeholder text to all pricing cards across tabs
function showPriceLoadingState(isLoading) {
  if (isPricingLoaded && !isLoading) return;
  ["1m", "3m", "6m", "12m"].forEach(tier => {
    const priceEl = document.getElementById(`price-${tier}`);
    if (!priceEl) return;
    
    if (isLoading) {
      priceEl.classList.add("price-loading");
      priceEl.innerHTML = `<span style="font-size:14px; color:var(--text-muted); font-weight:700;">Loading...</span>`;
    } else {
      priceEl.classList.remove("price-loading");
    }
  });
}

function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.innerText = msg;
  toast.style.borderColor = isError ? "var(--rose)" : "var(--emerald)";
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3500);
}

function setupTheme() {
  const savedTheme = localStorage.getItem("gym_theme");
  const current = savedTheme ? savedTheme : "dark";
  
  document.documentElement.setAttribute("data-theme", current);

  const themeBtn = document.getElementById("theme-btn");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const active = document.documentElement.getAttribute("data-theme");
      const next = active === "dark" ? "light" : "dark";
      State.theme = next;
      localStorage.setItem("gym_theme", next);
      document.documentElement.setAttribute("data-theme", next);
    });
  }
}

function switchView(viewName, skipFetch = false) {
  State.activeView = viewName;
  document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.remove("hidden");

  const syncPill = document.getElementById("sync-pill");
  const headerNav = document.getElementById("landing-header-nav");
  const topLoginBtn = document.getElementById("top-login-btn");
  const floatingInquiryBtn = document.getElementById("floating-inquiry-btn");

  if (viewName === "auth") {
    if (syncPill) syncPill.classList.add("hidden");
    if (headerNav) headerNav.classList.remove("hidden");
    if (topLoginBtn) topLoginBtn.classList.remove("hidden");
    if (floatingInquiryBtn) floatingInquiryBtn.classList.remove("hidden");
  } else {
    if (syncPill) syncPill.classList.remove("hidden");
    if (headerNav) headerNav.classList.add("hidden");
    if (topLoginBtn) topLoginBtn.classList.add("hidden");
    if (floatingInquiryBtn) floatingInquiryBtn.classList.add("hidden");

    if (!skipFetch) {
      fetchData(true);
    } else {
      if (viewName === "member") renderMember();
    }
  }
}

function setupEvents() {
  document.getElementById("btn-login-member")?.addEventListener("click", handleMemberLogin);
  document.getElementById("input-member-phone")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      dismissMobileKeyboard();
      handleMemberLogin();
    }
  });

  const loginModal = document.getElementById("member-login-modal");
  if (loginModal) {
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        closeMemberLoginModal();
      }
    });
  }

  const inquiryModal = document.getElementById("inquiry-modal");
  if (inquiryModal) {
    inquiryModal.addEventListener("click", (e) => {
      if (e.target === inquiryModal) {
        closeInquiryModal();
      }
    });
  }

  window.addEventListener("click", () => {
    if (State.activeView === "member") touchMemberSession();
  });
}

function setupFaqAccordion() {
  document.querySelectorAll(".faq-item").forEach(item => {
    item.addEventListener("click", () => {
      const isOpen = item.classList.contains("active");
      document.querySelectorAll(".faq-item").forEach(el => {
        el.classList.remove("active");
        const toggle = el.querySelector(".faq-toggle");
        if (toggle) toggle.innerText = "+";
      });

      if (!isOpen) {
        item.classList.add("active");
        const toggle = item.querySelector(".faq-toggle");
        if (toggle) toggle.innerText = "−";
      }
    });
  });
}

// --- DYNAMIC PRICING MAPPER ---
function updatePlanRatesFromCloud(plansObj) {
  if (!plansObj) return;

  isPricingLoaded = true;
  const getP = (key, fallback) => plansObj[key] !== undefined ? `₹${Number(plansObj[key]).toLocaleString()}` : fallback;

  PLAN_RATES = {
    without: {
      "1m": { price: getP("1 Month (Without Treadmill)", "₹1,200"), sub: "/mo", label: "✕ Treadmill Excluded", fullLabel: "1 Month (Without Treadmill)" },
      "3m": { price: getP("3 Month (Without Treadmill)", "₹3,000"), sub: "/3 mo", label: "✕ Treadmill Excluded", fullLabel: "3 Month (Without Treadmill)" },
      "6m": { price: getP("6 Month (Without Treadmill)", "₹5,500"), sub: "/6 mo", label: "✕ Treadmill Excluded", fullLabel: "6 Month (Without Treadmill)" },
      "12m": { price: getP("12 Month (Without Treadmill)", "₹10,000"), sub: "/yr", label: "✕ Treadmill Excluded", fullLabel: "12 Month (Without Treadmill)" }
    },
    with: {
      "1m": { price: getP("1 Month (With Treadmill)", "₹1,500"), sub: "/mo", label: "✓ Includes Treadmill & Cardio", fullLabel: "1 Month (With Treadmill)" },
      "3m": { price: getP("3 Month (With Treadmill)", "₹4,000"), sub: "/3 mo", label: "✓ Includes Treadmill & Cardio", fullLabel: "3 Month (With Treadmill)" },
      "6m": { price: getP("6 Month (With Treadmill)", "₹7,500"), sub: "/6 mo", label: "✓ Includes Treadmill & Cardio", fullLabel: "6 Month (With Treadmill)" },
      "12m": { price: getP("12 Month (With Treadmill)", "₹14,000"), sub: "/yr", label: "✓ Includes Treadmill & Cardio", fullLabel: "12 Month (With Treadmill)" }
    }
  };

  showPriceLoadingState(false);
  switchPlanCategory(currentPlanMode);
  updateInquiryDropdownOptions(plansObj);
}

function updateInquiryDropdownOptions(plansObj) {
  const selectEl = document.getElementById("inq-plan");
  if (!selectEntryExists(selectEl)) return;

  selectEl.innerHTML = `
    <optgroup label="Without Treadmill">
      <option value="1 Month (Without Treadmill)">1 Month - ₹${Number(plansObj["1 Month (Without Treadmill)"] || 1200).toLocaleString()}</option>
      <option value="3 Month (Without Treadmill)">3 Month - ₹${Number(plansObj["3 Month (Without Treadmill)"] || 3000).toLocaleString()}</option>
      <option value="6 Month (Without Treadmill)">6 Month - ₹${Number(plansObj["6 Month (Without Treadmill)"] || 5500).toLocaleString()}</option>
      <option value="12 Month (Without Treadmill)">12 Month - ₹${Number(plansObj["12 Month (Without Treadmill)"] || 10000).toLocaleString()}</option>
    </optgroup>
    <optgroup label="With Treadmill">
      <option value="1 Month (With Treadmill)">1 Month - ₹${Number(plansObj["1 Month (With Treadmill)"] || 1500).toLocaleString()}</option>
      <option value="3 Month (With Treadmill)">3 Month - ₹4,000</option>
      <option value="6 Month (With Treadmill)">6 Month - ₹7,500</option>
      <option value="12 Month (With Treadmill)">12 Month - ₹14,000</option>
    </optgroup>
  `;
}

function selectEntryExists(el) {
  return el !== null;
}

function switchPlanCategory(mode) {
  currentPlanMode = mode;
  const isWith = mode === "with";

  document.getElementById("tab-no-treadmill")?.classList.toggle("active", !isWith);
  document.getElementById("tab-with-treadmill")?.classList.toggle("active", isWith);

  const rates = PLAN_RATES[mode];

  ["1m", "3m", "6m", "12m"].forEach(tier => {
    const priceEl = document.getElementById(`price-${tier}`);
    const perkEl = document.getElementById(`perk-treadmill-${tier}`);
    
    if (priceEl) {
      if (!isPricingLoaded) {
        priceEl.innerHTML = `<span style="font-size:14px; color:var(--text-muted); font-weight:700;">Loading...</span>`;
      } else {
        priceEl.innerHTML = `${rates[tier].price}<span>${rates[tier].sub}</span>`;
      }
    }
    if (perkEl) {
      perkEl.innerText = rates[tier].label;
      perkEl.style.color = isWith ? "var(--emerald-text)" : "var(--text-muted)";
    }
  });
}

function selectCardPlan(duration) {
  const tierKey = duration === "1 Month" ? "1m" : duration === "3 Month" ? "3m" : duration === "6 Month" ? "6m" : "12m";
  const targetLabel = PLAN_RATES[currentPlanMode][tierKey].fullLabel;
  openInquiryModal(targetLabel);
}

function handleInquirySubmit(e) {
  e.preventDefault();
  dismissMobileKeyboard();

  const name = document.getElementById("inq-name").value.trim();
  const phone = document.getElementById("inq-phone").value.trim();
  const plan = document.getElementById("inq-plan").value;

  if (!name || !phone) {
    showToast("Please enter your name and mobile number.", true);
    return;
  }

  const gymWhatsAppNumber = "919996688788"; 
  const message = `Hi Gold Fitness Gym, my name is *${name}* (Phone: ${phone}). I am interested in joining the *${plan}*. Please contact me with further details.`;
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${gymWhatsAppNumber}?text=${encodedMessage}`;

  showToast("Redirecting to WhatsApp...");
  
  e.target.reset();
  closeInquiryModal();

  setTimeout(() => {
    window.open(whatsappUrl, "_blank");
  }, 600);
}

// --- HELPER TO DISPLAY IN-LINE LOGIN ERROR ---
function setMemberLoginError(message) {
  const errorEl = document.getElementById("member-login-error");
  if (errorEl) {
    errorEl.innerText = message || "";
  }
}

// --- MEMBER AUTH & DATA ENGINE ---
async function handleMemberLogin() {
  dismissMobileKeyboard();
  setMemberLoginError("");

  const inputVal = document.getElementById("input-member-phone").value.trim();
  if (!inputVal) {
    setMemberLoginError("Please enter Phone Number or Member ID.");
    return;
  }

  await fetchData(true);

  const member = State.members.find(m => 
    String(m.Member_ID).trim().toLowerCase() === inputVal.toLowerCase()
  );

  if (!member) {
    setMemberLoginError("User is not registered as a gym member.");
    return;
  }

  closeMemberLoginModal();
  State.activeIdentifier = inputVal;
  saveMemberSession(inputVal);
  showToast(`Welcome back, ${member.Full_Name || "Member"}!`);
  switchView("member", true);
}

function getDaysRemaining(endDateStr) {
  if (!endDateStr) return 0;
  const parts = String(endDateStr).split("T")[0].split("-");
  if (parts.length < 3) return 0;

  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays >= 0 ? diffDays + 1 : diffDays;
}

function startSync() {
  if (State.timer) clearInterval(State.timer);
  State.timer = setInterval(() => {
    if (State.activeView !== "auth" && !State.isFetching) fetchData(true);
  }, CONFIG.pollInterval);
}

async function fetchData(silent = false) {
  if (!CONFIG.apiUrl || CONFIG.apiUrl.includes("YOUR_GOOGLE_APPS_SCRIPT")) return;

  State.isFetching = true;

  try {
    const res = await fetch(`${CONFIG.apiUrl}?action=getAllData`);
    const data = await res.json();
    State.members = data.members || [];
    State.transactions = data.transactions || [];

    if (data.plans) {
      updatePlanRatesFromCloud(data.plans);
    }

    if (State.activeView === "member") renderMember();
  } catch (err) {
    isPricingLoaded = true;
    showPriceLoadingState(false);
    if (!silent) showToast("Connection failed. Check network.", true);
  } finally {
    State.isFetching = false;
  }
}

function renderMember() {
  const member = State.members.find(m => 
    String(m.Member_ID).trim().toLowerCase() === String(State.activeIdentifier).trim().toLowerCase()
  );
  if (!member) return;

  const days = getDaysRemaining(member.Plan_End_Date);
  const dues = Number(member.Total_Due_Amount || 0);

  document.getElementById("m-member-name").innerText = member.Full_Name;
  document.getElementById("m-member-sub").innerText = `Member ID: ${member.Member_ID}`;
  
  document.getElementById("m-plan-badge").innerText = member.Plan_Name || "Membership";
  document.getElementById("m-days-number").innerText = Math.max(0, days);
  
  document.getElementById("m-start-date").innerText = formatDate(member.Plan_Start_Date);
  document.getElementById("m-end-date").innerText = formatDate(member.Plan_End_Date);
  document.getElementById("m-due-amount").innerText = dues.toLocaleString();

  const planName = String(member.Plan_Name || "");
  let totalDays = 30;

  if (planName.includes("3 Month")) totalDays = 90;
  else if (planName.includes("6 Month")) totalDays = 180;
  else if (planName.includes("1 Year") || planName.includes("12 Month")) totalDays = 365;
  else if (planName.includes("Custom")) {
    const matched = planName.match(/\d+/);
    totalDays = matched ? parseInt(matched[0], 10) : 30;
  }

  const progressPercent = Math.min(100, Math.max(0, (days / totalDays) * 100));
  const progressBar = document.getElementById("m-progress-bar");
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  const statusPill = document.getElementById("m-status-pill");
  if (statusPill) {
    if (days < 0) {
      statusPill.className = "status-pill status-expired";
      statusPill.innerText = "Membership Expired";
    } else {
      statusPill.className = "status-pill status-active";
      statusPill.innerText = dues > 0 ? "Active (Dues Pending)" : "Active Member";
    }
  }

  const userTxns = State.transactions
    .filter(t => String(t.Member_ID).trim() === String(member.Member_ID).trim())
    .reverse();

  const txnBody = document.getElementById("m-transaction-rows");
  if (!txnBody) return;
  txnBody.innerHTML = "";

  if (userTxns.length === 0) {
    txnBody.innerHTML = `<tr><td colspan="4" style="text-align: left; padding: 14px 10px; color: var(--text-muted);">No payment records.</td></tr>`;
  } else {
    userTxns.forEach(t => {
      txnBody.innerHTML += `
        <tr>
          <td><strong>${formatDate(t.Date)}</strong></td>
          <td><strong>₹${Number(t.Amount_Paid || 0).toLocaleString()}</strong></td>
          <td><span class="badge" style="color: var(--text-main); font-weight: 600;">${t.Payment_Mode || "Cash"}</span></td>
          <td>${t.Notes || "Payment"}</td>
        </tr>
      `;
    });
  }
}
