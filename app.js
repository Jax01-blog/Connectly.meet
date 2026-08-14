/* =========================================================
   CONNECTLY 2.0
   Frontend controller
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyCWliI60g90f-Ed4ydFBPbz027fo7N29tI",
  authDomain: "ceezy-website.firebaseapp.com",
  projectId: "ceezy-website",
  storageBucket: "ceezy-website.appspot.com",
  messagingSenderId: "59858219268",
  appId: "1:59858219268:web:placeholder"
};

const SUPABASE_URL =
  "https://brululwrccmvhlhevjkn.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_u8Mb93q3osN_qdtnD2nNBQ_2FNQu9BP";

const DEFAULT_AVATAR =
  "https://randomuser.me/api/portraits/lego/1.jpg";

const DAILY_SWIPES = 20;


/* =========================================================
   FIREBASE
   ========================================================= */

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

let messaging = null;

try {
  messaging = firebase.messaging();
} catch (error) {
  console.warn("Firebase messaging unavailable.");
}


/* =========================================================
   SUPABASE
   ========================================================= */

let supabase = null;

try {
  if (
    window.supabase &&
    typeof window.supabase.createClient === "function"
  ) {
    supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false
        }
      }
    );
  }
} catch (error) {
  console.error("Supabase initialization failed:", error);
}


/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;

let currentChatPartner = null;

let unsubscribeMessages = null;
let unsubscribeNotifications = null;
let unsubscribeUser = null;

let heartbeatInterval = null;
let typingTimeout = null;

let isAdminLoggedIn = false;

let aiConversation = [
  {
    role: "system",
    content:
      "You are Connectly AI, a friendly assistant inside the Connectly application."
  }
];


/* =========================================================
   HELPERS
   ========================================================= */

const $ = id => document.getElementById(id);

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function avatar(url) {
  return url || DEFAULT_AVATAR;
}

function showLoader(show = true) {
  $("globalLoader")?.classList.toggle("hidden", !show);
}

function showToast(message) {
  const toast = document.createElement("div");

  toast.className = "notification-toast";

  toast.textContent = message;

  Object.assign(toast.style, {
    position: "fixed",
    left: "50%",
    bottom: "95px",
    transform: "translateX(-50%)",
    zIndex: "9999",
    padding: "12px 17px",
    borderRadius: "14px",
    background: "#151827",
    color: "white",
    border: "1px solid rgba(255,255,255,.1)",
    boxShadow: "0 15px 40px rgba(0,0,0,.4)",
    fontSize: "12px"
  });

  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}


/* =========================================================
   CUSTOM DIALOGS
   ========================================================= */

window.customAlert = function(message, title = "Notice") {

  return new Promise(resolve => {

    const modal = document.createElement("div");

    modal.className = "custom-modal";

    modal.innerHTML = `
      <div class="custom-modal-content">

        <h3>${escapeHTML(title)}</h3>

        <p>${escapeHTML(message)}</p>

        <div class="custom-modal-buttons">

          <button class="confirm-btn">
            OK
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".confirm-btn").onclick = () => {
      modal.remove();
      resolve();
    };

  });
};


window.customConfirm = function(message, title = "Confirm") {

  return new Promise(resolve => {

    const modal = document.createElement("div");

    modal.className = "custom-modal";

    modal.innerHTML = `
      <div class="custom-modal-content">

        <h3>${escapeHTML(title)}</h3>

        <p>${escapeHTML(message)}</p>

        <div class="custom-modal-buttons">

          <button class="confirm-btn">
            Yes
          </button>

          <button class="cancel-btn">
            Cancel
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector(".confirm-btn").onclick = () => {
      modal.remove();
      resolve(true);
    };

    modal.querySelector(".cancel-btn").onclick = () => {
      modal.remove();
      resolve(false);
    };

  });
};


window.customPrompt = function(
  message,
  defaultValue = "",
  title = "Input"
) {

  return new Promise(resolve => {

    const modal = document.createElement("div");

    modal.className = "custom-modal";

    modal.innerHTML = `
      <div class="custom-modal-content">

        <h3>${escapeHTML(title)}</h3>

        <p>${escapeHTML(message)}</p>

        <input
          class="custom-prompt-input"
          type="text"
          value="${escapeHTML(defaultValue)}"
          placeholder="Enter value..."
        >

        <div class="custom-modal-buttons">

          <button class="confirm-btn">
            OK
          </button>

          <button class="cancel-btn">
            Cancel
          </button>

        </div>

      </div>
    `;

    document.body.appendChild(modal);

    const input =
      modal.querySelector(".custom-prompt-input");

    input.focus();

    modal.querySelector(".confirm-btn").onclick = () => {

      const value = input.value;

      modal.remove();

      resolve(value);

    };

    modal.querySelector(".cancel-btn").onclick = () => {

      modal.remove();

      resolve(null);

    };

  });
};

window.alert = window.customAlert;
window.confirm = window.customConfirm;
window.prompt = window.customPrompt;


/* =========================================================
   REFERRALS
   ========================================================= */

function generateReferralCode() {

  return (
    "r" +
    Math.random()
      .toString(36)
      .substring(2, 9)
  );
}


async function applyReferral(refCode, newUserId) {

  if (!refCode) return false;

  const snap = await db
    .collection("users")
    .where("referralCode", "==", refCode)
    .limit(1)
    .get();

  if (snap.empty) return false;

  const referrer = snap.docs[0];

  if (referrer.id === newUserId) {
    return false;
  }

  const now = Date.now();

  const week =
    7 * 24 * 60 * 60 * 1000;

  const threeDays =
    3 * 24 * 60 * 60 * 1000;

  const referrerData = referrer.data();

  const currentExpiry =
    referrerData.premiumExpiresAt || 0;

  await db
    .collection("users")
    .doc(referrer.id)
    .update({
      isPremium: true,
      premiumPlan: "gold",
      premiumExpiresAt:
        Math.max(currentExpiry, now) + week,
      features: {
        unlimitedSwipes: true,
        seeWhoLikedYou: true,
        readReceipts: false,
        boost: false
      }
    });

  await db
    .collection("users")
    .doc(newUserId)
    .update({
      isPremium: true,
      premiumPlan: "gold",
      premiumExpiresAt:
        now + threeDays,
      features: {
        unlimitedSwipes: true,
        seeWhoLikedYou: true,
        readReceipts: false,
        boost: false
      }
    });

  return true;
}


/* =========================================================
   AUTH
   ========================================================= */

const googleProvider =
  new firebase.auth.GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: "select_account"
});


window.signupUser = async function(
  email,
  password,
  name,
  age,
  gender,
  referralCode
) {

  const existing =
    await db
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

  if (!existing.empty) {
    throw new Error(
      "An account with this email already exists."
    );
  }

  const credential =
    await auth.createUserWithEmailAndPassword(
      email,
      password
    );

  await credential.user.updateProfile({
    displayName: name
  });

  await credential.user.sendEmailVerification();

  const uid = credential.user.uid;

  const ownReferral =
    generateReferralCode();

  const userData = {

    uid,

    name,

    email,

    age: Number(age),

    gender,

    bio: "New here!",

    interests: [],

    profilePic: "",

    matches: [],

    swipes: [],

    swipesToday: 0,

    lastSwipeDate: Date.now(),

    blocked: [],

    reports: [],

    location: null,

    createdAt: Date.now(),

    lastSeen: Date.now(),

    emailVerified: false,

    privacyLastSeen: true,

    privacyOnlineStatus: true,

    prefAgeMin: 18,

    prefAgeMax: 100,

    prefDistance: 50,

    isPremium: false,

    premiumPlan: "free",

    premiumExpiresAt: 0,

    features: {
      unlimitedSwipes: false,
      readReceipts: false,
      seeWhoLikedYou: false,
      boost: false
    },

    verified: false,

    intent: "Serious",

    introUrl: "",

    banned: false,

    referralCode: ownReferral
  };

  await db
    .collection("users")
    .doc(uid)
    .set(userData);

  if (referralCode?.trim()) {
    await applyReferral(
      referralCode.trim(),
      uid
    );
  }

  await customAlert(
    "Your account was created. Check your email to verify your account.",
    "Welcome to Connectly"
  );

  return credential.user;
};


window.signInWithGoogle = async function() {

  const result =
    await auth.signInWithPopup(
      googleProvider
    );

  const user = result.user;

  const ref =
    db.collection("users").doc(user.uid);

  const existing = await ref.get();

  if (!existing.exists) {

    await ref.set({

      uid: user.uid,

      name:
        user.displayName ||
        user.email.split("@")[0],

      email: user.email,

      age: 18,

      gender: "",

      bio: "New here!",

      interests: [],

      profilePic:
        user.photoURL || "",

      matches: [],

      swipes: [],

      swipesToday: 0,

      lastSwipeDate: Date.now(),

      blocked: [],

      reports: [],

      location: null,

      createdAt: Date.now(),

      lastSeen: Date.now(),

      emailVerified: true,

      privacyLastSeen: true,

      privacyOnlineStatus: true,

      prefAgeMin: 18,

      prefAgeMax: 100,

      prefDistance: 50,

      isPremium: false,

      premiumPlan: "free",

      premiumExpiresAt: 0,

      features: {
        unlimitedSwipes: false,
        readReceipts: false,
        seeWhoLikedYou: false,
        boost: false
      },

      verified: false,

      intent: "Serious",

      introUrl: "",

      banned: false,

      referralCode:
        generateReferralCode()

    });

  } else {

    const data = existing.data();

    if (data.banned) {

      await auth.signOut();

      throw new Error(
        "Your account has been banned."
      );

    }

    await ref.update({
      lastSeen: Date.now(),
      emailVerified: true
    });

  }

  return user;
};


window.loginUserFirebase = async function(
  email,
  password
) {

  const credential =
    await auth.signInWithEmailAndPassword(
      email,
      password
    );

  if (!credential.user.emailVerified) {

    await auth.signOut();

    throw new Error(
      "Please verify your email before signing in."
    );

  }

  const ref =
    db.collection("users")
      .doc(credential.user.uid);

  const snap = await ref.get();

  if (!snap.exists) {

    await auth.signOut();

    throw new Error(
      "Your profile could not be found."
    );

  }

  const data = snap.data();

  if (data.banned) {

    await auth.signOut();

    throw new Error(
      "Your account has been banned."
    );

  }

  await ref.update({
    lastSeen: Date.now()
  });

  return credential.user;
};


/* =========================================================
   CURRENT USER
   ========================================================= */

async function loadCurrentUser() {

  const uid =
    localStorage.getItem(
      "currentUserUid"
    );

  if (!uid) return null;

  const snap =
    await db
      .collection("users")
      .doc(uid)
      .get();

  if (!snap.exists) {

    localStorage.removeItem(
      "currentUserUid"
    );

    return null;
  }

  currentUser = snap.data();

  return currentUser;
}


async function refreshCurrentUser() {

  if (!currentUser?.uid) return;

  const snap =
    await db
      .collection("users")
      .doc(currentUser.uid)
      .get();

  if (snap.exists) {
    currentUser = snap.data();
  }
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function attachNavigation() {

  document
    .querySelectorAll("[data-nav]")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const target =
            button.dataset.nav;

          if (target === "stories") {

            await watchStories();

            return;
          }

          document
            .querySelectorAll(".view")
            .forEach(view =>
              view.classList.remove(
                "active-view"
              )
            );

          const targetView =
            $(`${target}View`);

          if (!targetView) return;

          targetView.classList.add(
            "active-view"
          );

          document
            .querySelectorAll(".nav-item")
            .forEach(nav =>
              nav.classList.remove(
                "active"
              )
            );

          document
            .querySelectorAll(
              `[data-nav="${target}"]`
            )
            .forEach(nav =>
              nav.classList.add("active")
            );

          if (target === "swipe") {
            await renderSwipeCards();
          }

          if (target === "explore") {
            await renderExplore();
          }

          if (target === "messages") {

            $("chatListContainer")
              .style.display = "block";

            $("chatScreenContainer")
              .style.display = "none";

            await renderChatList();

          }

          if (target === "profile") {
            await renderProfileUI();
          }

        }
      );

    });
}


/* =========================================================
   PROFILE
   ========================================================= */

async function renderProfileUI() {

  if (!currentUser) return;

  const photo =
    avatar(currentUser.profilePic);

  if ($("profileUsername"))
    $("profileUsername").innerHTML =
      `${escapeHTML(currentUser.name)}
       <span class="verified-badge"
       style="display:${currentUser.verified ? "inline" : "none"}">
       <i class="fas fa-check"></i>
       </span>`;

  $("profileStatus").textContent =
    currentUser.bio ||
    "Hey there!";

  $("profileAvatar").src = photo;

  $("topAvatar").src = photo;

  $("sidebarAvatar").src = photo;

  $("sidebarName").textContent =
    currentUser.name;

  $("matchesCount").textContent =
    currentUser.matches?.length || 0;

  $("likesCount").textContent =
    currentUser.swipes?.length || 0;

  $("viewsCount").textContent = "0";

  const fields = [
    currentUser.name,
    currentUser.bio,
    currentUser.profilePic,
    currentUser.interests?.length
  ];

  const filled =
    fields.filter(Boolean).length;

  $("profileProgress").style.width =
    `${Math.min(100, filled / 4 * 100)}%`;

  renderSettings();

  setupProfileEditing();
}


function renderSettings() {

  const settings = [

    ["fas fa-user-circle","Account","account"],

    ["fas fa-lock","Privacy","privacy"],

    ["fas fa-sliders","Dating Preferences","dating"],

    ["fas fa-crown","Premium Features","premium"],

    ["fas fa-question-circle","Help & Support","help"],

    ["fas fa-gem","Upgrade to Premium","upgrade"],

    ["fas fa-id-card","Verify Identity","verify"],

    ["fas fa-calendar","Events","events"],

    ["fas fa-link","Copy Referral Link","referral"],

    ["fas fa-user-plus","Invite Friends","invite"],

    ["fas fa-star","Rate Connectly","rate"],

    ["fas fa-right-from-bracket","Log out","logout"],

    ["fas fa-trash","Delete Account","delete"]

  ];

  $("settingsListContainer").innerHTML =
    settings.map(item => `

      <div
        class="settings-item"
        data-setting="${item[2]}"
      >

        <div class="settings-item-left">

          <i class="${item[0]}"></i>

          <span>${item[1]}</span>

        </div>

        <i class="fas fa-chevron-right"></i>

      </div>

    `).join("");

  document
    .querySelectorAll(".settings-item")
    .forEach(item => {

      item.addEventListener(
        "click",
        () => handleSetting(
          item.dataset.setting
        )
      );

    });
}


async function handleSetting(key) {

  switch (key) {

    case "account":
    case "privacy":
    case "dating":
    case "premium":
    case "help":
      showSettingsDetail(key);
      break;

    case "upgrade":
      await showUpgradeModal();
      break;

    case "verify":
      await verifyIdentity();
      break;

    case "events":
      await loadEvents();
      break;

    case "referral":
      await copyReferralLink();
      break;

    case "invite":
      await showContactsInvite();
      break;

    case "rate":
      await showRatingModal();
      break;

    case "logout":
      await logout();
      break;

    case "delete":
      await deleteAccount();
      break;

  }
}


/* =========================================================
   EDIT PROFILE
   ========================================================= */

function setupProfileEditing() {

  $("editProfileBtn").onclick = () => {

    document
      .querySelectorAll(".view")
      .forEach(v =>
        v.classList.remove(
          "active-view"
        )
      );

    $("editProfileView")
      .classList.add("active-view");

    $("editName").value =
      currentUser.name || "";

    $("editBio").value =
      currentUser.bio || "";

    $("editIntent").value =
      currentUser.intent || "Serious";

    $("editInterests").value =
      (currentUser.interests || [])
        .join(", ");

    $("editProfileAvatar").src =
      avatar(currentUser.profilePic);
  };


  $("cancelEditBtn").onclick = () => {

    $("editProfileView")
      .classList.remove(
        "active-view"
      );

    $("profileView")
      .classList.add(
        "active-view"
      );

  };


  $("saveProfileBtn").onclick =
    async () => {

      const name =
        $("editName").value.trim();

      const bio =
        $("editBio").value.trim();

      const intent =
        $("editIntent").value;

      const interests =
        $("editInterests")
          .value
          .split(",")
          .map(x => x.trim())
          .filter(Boolean);

      if (!name) {

        await customAlert(
          "Please enter your name.",
          "Profile"
        );

        return;
      }

      await db
        .collection("users")
        .doc(currentUser.uid)
        .update({

          name,

          bio,

          intent,

          interests

        });

      await refreshCurrentUser();

      await renderProfileUI();

      $("editProfileView")
        .classList.remove(
          "active-view"
        );

      $("profileView")
        .classList.add(
          "active-view"
        );

      await customAlert(
        "Your profile has been updated.",
        "Saved"
      );

    };


  $("changePhotoBtn").onclick =
    () => $("photoUploadInput").click();


  $("photoUploadInput").onchange =
    async event => {

      const file =
        event.target.files?.[0];

      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {

        await customAlert(
          "Your image must be smaller than 5MB.",
          "Image too large"
        );

        return;
      }

      if (!supabase) {

        await customAlert(
          "Image upload service is unavailable.",
          "Upload"
        );

        return;
      }

      const filename =
        `${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g,"_")}`;

      const result =
        await supabase.storage
          .from("profile-pictures")
          .upload(
            filename,
            file,
            { upsert: true }
          );

      if (result.error) {

        console.error(result.error);

        await customAlert(
          "Could not upload the image.",
          "Upload failed"
        );

        return;
      }

      const publicURL =
        supabase.storage
          .from("profile-pictures")
          .getPublicUrl(filename)
          .data.publicUrl;

      await db
        .collection("users")
        .doc(currentUser.uid)
        .update({
          profilePic: publicURL
        });

      await refreshCurrentUser();

      await renderProfileUI();

      await customAlert(
        "Profile picture updated.",
        "Success"
      );

    };

}


async function copyReferralLink() {

  const link =
    `${location.origin}/?ref=${currentUser.referralCode}`;

  try {

    await navigator.clipboard.writeText(link);

    await customAlert(
      "Your referral link has been copied.",
      "Referral"
    );

  } catch {

    await customAlert(
      link,
      "Your referral link"
    );

  }
}


/* =========================================================
   DISCOVERY
   ========================================================= */

async function getAvailableProfiles() {

  const snapshot =
    await db
      .collection("users")
      .get();

  const swiped =
    currentUser.swipes || [];

  const blocked =
    currentUser.blocked || [];

  return snapshot.docs
    .map(doc => doc.data())
    .filter(user =>

      user.uid !== currentUser.uid &&

      !swiped.includes(user.uid) &&

      !blocked.includes(user.uid) &&

      user.banned !== true

    );
}


function computeCompatibility(user) {

  const mine =
    currentUser.interests || [];

  const theirs =
    user.interests || [];

  const shared =
    mine.filter(x =>
      theirs.includes(x)
    ).length;

  const max =
    Math.max(
      mine.length,
      theirs.length
    );

  const interestScore =
    max
      ? (shared / max) * 60
      : 0;

  const ageScore =
    Math.max(
      0,
      40 -
      Math.abs(
        currentUser.age -
        user.age
      )
    );

  return Math.min(
    100,
    Math.round(
      interestScore +
      ageScore
    )
  );
}


async function renderSwipeCards() {

  const container =
    $("cardsStack");

  if (!container) return;

  const users =
    await getAvailableProfiles();

  if (!users.length) {

    container.innerHTML = `
      <div class="loading-card">

        <i
          class="fas fa-heart"
          style="font-size:40px;color:#8b5cf6"
        ></i>

        <strong>No more profiles</strong>

        <p>
          Check back later for new people.
        </p>

      </div>
    `;

    await checkDailySwipes();

    return;
  }

  let index = 0;

  const renderCard = () => {

    if (index >= users.length) return;

    const user =
      users[index];

    container.innerHTML = `

      <article class="swipe-card">

        <img
          class="card-img"
          src="${escapeHTML(avatar(user.profilePic))}"
          alt=""
        >

        <h3>
          ${escapeHTML(user.name)},
          ${escapeHTML(user.age)}
        </h3>

        <p>
          ${escapeHTML(
            user.bio ||
            "No bio yet."
          )}
        </p>

        <div>
          🎯 ${escapeHTML(
            user.intent ||
            "Not specified"
          )}
        </div>

        <div>
          ✨ Compatibility:
          ${computeCompatibility(user)}%
        </div>

        <button
          class="small-glass report-profile-btn"
        >
          Report
        </button>

      </article>
    `;

    container
      .querySelector(".report-profile-btn")
      .onclick = () =>
        showReportModal(
          user.uid,
          user.name
        );

  };

  renderCard();

  $("likeBtn").onclick =
    async () => {

      const allowed =
        await checkDailySwipes();

      if (!allowed) return;

      await swipeUser(
        users[index],
        true
      );

      index++;

      if (index >= users.length) {

        await renderSwipeCards();

      } else {

        renderCard();

      }

    };


  $("passBtn").onclick =
    async () => {

      const allowed =
        await checkDailySwipes();

      if (!allowed) return;

      await swipeUser(
        users[index],
        false
      );

      index++;

      if (index >= users.length) {

        await renderSwipeCards();

      } else {

        renderCard();

      }

    };


  await checkDailySwipes();
}


async function swipeUser(
  target,
  liked
) {

  await db
    .collection("users")
    .doc(currentUser.uid)
    .update({

      swipes:
        firebase.firestore.FieldValue
          .arrayUnion(target.uid),

      swipesToday:
        (currentUser.swipesToday || 0) + 1

    });

  currentUser.swipes =
    currentUser.swipes || [];

  currentUser.swipes.push(
    target.uid
  );

  currentUser.swipesToday =
    (currentUser.swipesToday || 0) + 1;

  if (!liked) return;

  await sendLikeNotification(
    currentUser.uid,
    target.uid,
    currentUser.name
  );

  const targetData =
    target.swipes || [];

  if (targetData.includes(
    currentUser.uid
  )) {

    await createMatch(target);

  } else {

    showToast(
      `Liked ${target.name}`
    );

  }
}


async function createMatch(target) {

  await db
    .collection("users")
    .doc(currentUser.uid)
    .update({

      matches:
        firebase.firestore.FieldValue
          .arrayUnion(target.uid)

    });

  await db
    .collection("users")
    .doc(target.uid)
    .update({

      matches:
        firebase.firestore.FieldValue
          .arrayUnion(currentUser.uid)

    });

  currentUser.matches =
    currentUser.matches || [];

  if (!currentUser.matches.includes(
    target.uid
  )) {

    currentUser.matches.push(
      target.uid
    );

  }

  $("matchToast").style.display =
    "flex";

  setTimeout(() => {

    $("matchToast").style.display =
      "none";

  }, 4000);

  await customAlert(
    `You and ${target.name} liked each other!`,
    "It's a match!"
  );
}


async function checkDailySwipes() {

  if (
    currentUser.features
      ?.unlimitedSwipes === true
  ) {

    $("swipeCounter").textContent =
      "✨ Unlimited swipes · Premium";

    return true;
  }

  const today =
    new Date().toDateString();

  const previous =
    currentUser.lastSwipeDate
      ? new Date(
          currentUser.lastSwipeDate
        ).toDateString()
      : null;

  if (today !== previous) {

    currentUser.swipesToday = 0;

    currentUser.lastSwipeDate =
      Date.now();

    await db
      .collection("users")
      .doc(currentUser.uid)
      .update({
        swipesToday: 0,
        lastSwipeDate: Date.now()
      });

  }

  const remaining =
    Math.max(
      0,
      DAILY_SWIPES -
      (currentUser.swipesToday || 0)
    );

  $("swipeCounter").textContent =
    `Swipes remaining today: ${remaining}`;

  return remaining > 0;
}


/* =========================================================
   EXPLORE
   ========================================================= */

async function renderExplore() {

  const snapshot =
    await db
      .collection("users")
      .get();

  let users =
    snapshot.docs
      .map(doc => doc.data())
      .filter(user =>
        user.uid !== currentUser.uid &&
        user.banned !== true &&
        !(currentUser.blocked || [])
          .includes(user.uid)
      );

  const minAge =
    Number(
      $("filterAgeMin").value
    ) || 18;

  const maxAge =
    Number(
      $("filterAgeMax").value
    ) || 100;

  const gender =
    $("filterGender").value;

  const intent =
    $("filterIntent").value;

  if (gender) {
    users =
      users.filter(
        user => user.gender === gender
      );
  }

  if (intent) {
    users =
      users.filter(
        user => user.intent === intent
      );
  }

  users =
    users.filter(
      user =>
        Number(user.age) >= minAge &&
        Number(user.age) <= maxAge
    );

  renderExploreCards(users);
}


function renderExploreCards(users) {

  const container =
    $("exploreList");

  if (!users.length) {

    container.innerHTML = `
      <div class="loading-card"
           style="grid-column:1/-1;min-height:250px">

        <i class="fas fa-compass"
           style="font-size:35px;color:#8b5cf6"></i>

        <strong>No people found</strong>

        <p>Try adjusting your filters.</p>

      </div>
    `;

    return;
  }

  container.innerHTML =
    users.map(user => `

      <article class="explore-card">

        <img
          src="${escapeHTML(avatar(user.profilePic))}"
          alt=""
        >

        <h4>
          ${escapeHTML(user.name)},
          ${escapeHTML(user.age)}
        </h4>

        <p style="
          color:#85899a;
          font-size:10px;
          margin-bottom:10px;
        ">
          ${escapeHTML(
            user.bio ||
            "No bio yet."
          )}
        </p>

        <button
          class="small-glass explore-like"
          data-id="${escapeHTML(user.uid)}"
        >
          <i class="fas fa-heart"></i>
          Like
        </button>

        <button
          class="small-glass report-btn"
          data-id="${escapeHTML(user.uid)}"
        >
          Report
        </button>

      </article>

    `).join("");

  container
    .querySelectorAll(".explore-like")
    .forEach(button => {

      button.onclick =
        async () => {

          const user =
            users.find(
              x =>
                x.uid ===
                button.dataset.id
            );

          if (!user) return;

          await swipeUser(
            user,
            true
          );

          button.disabled = true;

          button.innerHTML =
            `<i class="fas fa-check"></i> Liked`;

        };

    });

  container
    .querySelectorAll(".report-btn")
    .forEach(button => {

      button.onclick = () => {

        const user =
          users.find(
            x =>
              x.uid ===
              button.dataset.id
          );

        showReportModal(
          user.uid,
          user.name
        );

      };

    });
}


/* =========================================================
   NOTIFICATIONS
   ========================================================= */

async function sendLikeNotification(
  fromUserId,
  toUserId,
  fromName
) {

  await db
    .collection("notifications")
    .add({

      toUserId,

      fromUserId,

      fromName,

      type: "like",

      read: false,

      timestamp: Date.now()

    });

}


function listenForNotifications() {

  if (unsubscribeNotifications) {
    unsubscribeNotifications();
  }

  const query =
    db
      .collection("notifications")
      .where(
        "toUserId",
        "==",
        currentUser.uid
      )
      .where(
        "read",
        "==",
        false
      );

  unsubscribeNotifications =
    query.onSnapshot(snapshot => {

      snapshot.docChanges()
        .forEach(change => {

          if (change.type !== "added")
            return;

          const data =
            change.doc.data();

          showToast(
            `💖 ${data.fromName} liked you`
          );

          change.doc.ref.update({
            read: true
          });

        });

    });
}


/* =========================================================
   CHAT LIST
   ========================================================= */

async function renderChatList() {

  const container =
    $("chatListContainerInner");

  const matches =
    currentUser.matches || [];

  if (!matches.length) {

    container.innerHTML = `
      <div class="loading-card"
           style="min-height:250px">

        <i class="fas fa-message"
           style="font-size:35px;color:#8b5cf6"></i>

        <strong>No matches yet</strong>

        <p>Start discovering people.</p>

      </div>
    `;

    return;
  }

  const snapshot =
    await db
      .collection("users")
      .get();

  const users =
    snapshot.docs
      .map(doc => doc.data());

  const matched =
    users.filter(
      user =>
        matches.includes(user.uid) &&
        user.banned !== true
    );

  const items =
    await Promise.all(
      matched.map(async user => {

        const chatId =
          [
            currentUser.uid,
            user.uid
          ].sort().join("_");

        const unread =
          await db
            .collection("chats")
            .doc(chatId)
            .collection("messages")
            .where(
              "senderId",
              "==",
              user.uid
            )
            .where(
              "read",
              "==",
              false
            )
            .limit(1)
            .get();

        return {
          ...user,
          unread: !unread.empty
        };

      })
    );

  container.innerHTML =
    items.map(user => `

      <div
        class="chat-list-item"
        data-id="${escapeHTML(user.uid)}"
      >

        <div style="position:relative">

          <img
            class="avatar"
            src="${escapeHTML(avatar(user.profilePic))}"
          >

          ${
            user.privacyOnlineStatus !== false &&
            Date.now() -
            (user.lastSeen || 0) <
            60000
            ? `<span class="online-dot"></span>`
            : ""
          }

        </div>

        <div class="chat-info">

          <div class="chat-name">

            ${escapeHTML(user.name)}

            ${
              user.verified
              ? `<i class="fas fa-check-circle verified-icon"></i>`
              : ""
            }

            ${
              user.unread
              ? `<span class="unread-dot"></span>`
              : ""
            }

          </div>

          <div class="last-msg">
            Tap to chat
          </div>

        </div>

        <button
          class="small-glass block-chat-btn"
          data-id="${escapeHTML(user.uid)}"
        >
          Block
        </button>

      </div>

    `).join("");

  container
    .querySelectorAll(".chat-list-item")
    .forEach(item => {

      item.onclick = event => {

        if (
          event.target.closest(
            ".block-chat-btn"
          )
        ) return;

        openChatScreen(
          item.dataset.id
        );

      };

    });

  container
    .querySelectorAll(".block-chat-btn")
    .forEach(button => {

      button.onclick =
        async event => {

          event.stopPropagation();

          const target =
            matched.find(
              x =>
                x.uid ===
                button.dataset.id
            );

          if (!target) return;

          const ok =
            await customConfirm(
              `Block ${target.name}?`,
              "Block user"
            );

          if (!ok) return;

          await db
            .collection("users")
            .doc(currentUser.uid)
            .update({

              blocked:
                firebase.firestore
                  .FieldValue
                  .arrayUnion(
                    target.uid
                  )

            });

          await refreshCurrentUser();

          await renderChatList();

        };

    });
}


/* =========================================================
   CHAT
   ========================================================= */

async function openChatScreen(partnerId) {

  currentChatPartner =
    partnerId;

  const snapshot =
    await db
      .collection("users")
      .get();

  const partner =
    snapshot.docs
      .map(doc => doc.data())
      .find(
        user =>
          user.uid === partnerId
      );

  if (!partner) return;

  $("chatListContainer")
    .style.display = "none";

  $("chatScreenContainer")
    .style.display = "block";

  const online =
    partner.privacyOnlineStatus !== false &&
    Date.now() -
    (partner.lastSeen || 0) <
    60000;

  $("chatScreenContainer").innerHTML = `

    <div class="chat-header">

      <button
        class="back-btn"
        id="backToChatList"
      >
        <i class="fas fa-arrow-left"></i>
      </button>

      <div class="chat-profile">

        <img
          src="${escapeHTML(avatar(partner.profilePic))}"
        >

        <div>

          <div class="chat-name">

            ${escapeHTML(partner.name)}

            ${
              partner.verified
              ? `<i class="fas fa-check-circle verified-icon"></i>`
              : ""
            }

          </div>

          <div class="chat-status">
            ${online ? "Online" : "Offline"}
          </div>

          <div
            id="typingStatus"
            style="
              color:#a78bfa;
              font-size:8px;
              margin-top:2px;
            "
          ></div>

        </div>

      </div>

      <div class="chat-actions">

        <i class="fas fa-phone"></i>

        <i class="fas fa-video"></i>

        <i
          class="fas fa-ban"
          id="blockFromChat"
        ></i>

      </div>

    </div>

    <div
      class="messages-area"
      id="messagesArea"
    ></div>

    <div class="input-area">

      <div class="chat-attach-btns">

        <button id="sendImageBtn">
          <i class="fas fa-image"></i>
        </button>

        <button id="sendVoiceBtn">
          <i class="fas fa-microphone"></i>
        </button>

      </div>

      <input
        id="messageInputChat"
        type="text"
        placeholder="Write a message..."
      >

      <button id="sendChatMsg">
        <i class="fas fa-paper-plane"></i>
      </button>

    </div>

  `;


  $("backToChatList").onclick =
    async () => {

      $("chatScreenContainer")
        .style.display = "none";

      $("chatListContainer")
        .style.display = "block";

      if (unsubscribeMessages) {
        unsubscribeMessages();
        unsubscribeMessages = null;
      }

      await renderChatList();

    };


  const chatId =
    [
      currentUser.uid,
      partnerId
    ].sort().join("_");


  setupChatRealtime(
    chatId,
    partnerId
  );

  setupChatImageUpload(chatId);

  setupVoiceRecording(chatId);

  setupChatInput(
    chatId,
    partnerId
  );

}


/* =========================================================
   REALTIME CHAT
   ========================================================= */

function setupChatRealtime(
  chatId,
  partnerId
) {

  const query =
    db
      .collection("chats")
      .doc(chatId)
      .collection("messages")
      .orderBy("timestamp");

  if (unsubscribeMessages) {
    unsubscribeMessages();
  }

  unsubscribeMessages =
    query.onSnapshot(
      async snapshot => {

        const messages =
          snapshot.docs.map(
            doc => ({
              id: doc.id,
              ...doc.data()
            })
          );

        const area =
          $("messagesArea");

        if (!area) return;

        area.innerHTML =
          messages.map(message => {

            const sent =
              message.senderId ===
              currentUser.uid;

            const time =
              new Date(
                message.timestamp
              ).toLocaleTimeString(
                [],
                {
                  hour: "2-digit",
                  minute: "2-digit"
                }
              );

            if (
              message.type ===
              "image"
            ) {

              return `
                <div class="message-bubble
                  ${sent ? "sent" : "received"}">

                  <img
                    src="${escapeHTML(message.text)}"
                  >

                  <div class="message-time">
                    ${time}
                  </div>

                </div>
              `;

            }

            if (
              message.type ===
              "voice"
            ) {

              return `
                <div class="message-bubble
                  ${sent ? "sent" : "received"}">

                  <audio
                    controls
                    src="${escapeHTML(message.text)}"
                    style="max-width:220px"
                  ></audio>

                  <div class="message-time">
                    ${time}
                  </div>

                </div>
              `;

            }

            return `
              <div class="message-bubble
                ${sent ? "sent" : "received"}">

                <div>
                  ${escapeHTML(message.text)}
                </div>

                <div class="message-time">
                  ${time}
                </div>

              </div>
            `;

          }).join("");

        area.scrollTop =
          area.scrollHeight;


        const unread =
          snapshot.docs.filter(
            doc => {

              const data =
                doc.data();

              return (
                data.senderId === partnerId &&
                data.read === false
              );

            }
          );

        await Promise.all(
          unread.map(doc =>
            doc.ref.update({
              read: true
            })
          )
        );

      }
    );

}


/* =========================================================
   CHAT INPUT
   ========================================================= */

function setupChatInput(
  chatId,
  partnerId
) {

  const input =
    $("messageInputChat");

  const send =
    $("sendChatMsg");

  const typingRef =
    db
      .collection("typing")
      .doc(
        `${currentUser.uid}_${partnerId}`
      );


  input.addEventListener(
    "input",
    async () => {

      await typingRef.set({

        userId:
          currentUser.uid,

        isTyping: true,

        timestamp: Date.now()

      });

      clearTimeout(
        typingTimeout
      );

      typingTimeout =
        setTimeout(
          async () => {

            await typingRef.set({

              userId:
                currentUser.uid,

              isTyping: false,

              timestamp:
                Date.now()

            });

          },
          1000
        );

    }
  );


  input.addEventListener(
    "keydown",
    event => {

      if (
        event.key === "Enter"
      ) {

        event.preventDefault();

        send.click();

      }

    }
  );


  send.onclick =
    async () => {

      const text =
        input.value.trim();

      if (!text) return;

      await db
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .add({

          senderId:
            currentUser.uid,

          text,

          type: "text",

          timestamp:
            Date.now(),

          status: "sent",

          read: false

        });

      input.value = "";

    };


  typingRef.onSnapshot(
    snapshot => {

      const status =
        $("typingStatus");

      if (!status) return;

      const data =
        snapshot.exists
          ? snapshot.data()
          : null;

      status.textContent =
        data?.isTyping &&
        data.userId === partnerId
          ? "typing..."
          : "";

    }
  );

}


/* =========================================================
   IMAGE CHAT
   ========================================================= */

function setupChatImageUpload(chatId) {

  $("sendImageBtn").onclick =
    () => {

      if (!supabase) {

        customAlert(
          "Image uploads are currently unavailable.",
          "Upload"
        );

        return;
      }

      const input =
        document.createElement("input");

      input.type = "file";

      input.accept =
        "image/*";

      input.onchange =
        async event => {

          const file =
            event.target.files?.[0];

          if (!file) return;

          if (
            file.size >
            10 * 1024 * 1024
          ) {

            await customAlert(
              "Images must be smaller than 10MB.",
              "Image too large"
            );

            return;
          }

          const filename =
            `${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g,"_")}`;

          const upload =
            await supabase.storage
              .from("chat-images")
              .upload(
                filename,
                file
              );

          if (upload.error) {

            console.error(
              upload.error
            );

            await customAlert(
              "Image upload failed.",
              "Upload"
            );

            return;
          }

          const url =
            supabase.storage
              .from("chat-images")
              .getPublicUrl(
                filename
              )
              .data.publicUrl;

          await db
            .collection("chats")
            .doc(chatId)
            .collection("messages")
            .add({

              senderId:
                currentUser.uid,

              text: url,

              type: "image",

              timestamp:
                Date.now(),

              status: "sent",

              read: false

            });

        };

      input.click();

    };

}


/* =========================================================
   VOICE CHAT
   ========================================================= */

function setupVoiceRecording(chatId) {

  let recorder = null;

  let chunks = [];

  $("sendVoiceBtn").onclick =
    async () => {

      if (!recorder) {

        try {

          const stream =
            await navigator
              .mediaDevices
              .getUserMedia({
                audio: true
              });

          recorder =
            new MediaRecorder(
              stream
            );

          chunks = [];

          recorder.ondataavailable =
            event => {

              if (
                event.data.size
              ) {

                chunks.push(
                  event.data
                );

              }

            };

          recorder.onstop =
            async () => {

              stream
                .getTracks()
                .forEach(
                  track =>
                    track.stop()
                );

              const blob =
                new Blob(
                  chunks,
                  {
                    type:
                      "audio/webm"
                  }
                );

              if (!supabase) {

                await customAlert(
                  "Voice upload service unavailable.",
                  "Voice message"
                );

                recorder = null;

                return;
              }

              const filename =
                `${currentUser.uid}_${Date.now()}.webm`;

              const result =
                await supabase.storage
                  .from(
                    "voice-messages"
                  )
                  .upload(
                    filename,
                    blob
                  );

              if (result.error) {

                console.error(
                  result.error
                );

                recorder = null;

                return;
              }

              const url =
                supabase.storage
                  .from(
                    "voice-messages"
                  )
                  .getPublicUrl(
                    filename
                  )
                  .data.publicUrl;

              await db
                .collection("chats")
                .doc(chatId)
                .collection("messages")
                .add({

                  senderId:
                    currentUser.uid,

                  text: url,

                  type: "voice",

                  timestamp:
                    Date.now(),

                  status: "sent",

                  read: false

                });

              recorder = null;

              $("sendVoiceBtn").innerHTML =
                `<i class="fas fa-microphone"></i>`;

            };

          recorder.start();

          $("sendVoiceBtn").innerHTML =
            `<i class="fas fa-stop"></i>`;

        } catch (error) {

          console.error(error);

          await customAlert(
            "Microphone permission was not granted.",
            "Microphone"
          );

        }

      } else {

        recorder.stop();

      }

    };

}


/* =========================================================
   REPORTING
   ========================================================= */

async function showReportModal(
  userId,
  userName
) {

  const modal =
    document.createElement("div");

  modal.className =
    "report-modal";

  modal.innerHTML = `

    <h3>
      Report ${escapeHTML(userName)}
    </h3>

    <button data-reason="Spam">
      Spam
    </button>

    <button data-reason="Inappropriate">
      Inappropriate
    </button>

    <button data-reason="Fake Profile">
      Fake profile
    </button>

    <button data-reason="Harassment">
      Harassment
    </button>

    <button data-reason="Other">
      Other
    </button>

    <button id="closeReportModal">
      Cancel
    </button>

  `;

  document.body.appendChild(
    modal
  );

  modal
    .querySelectorAll(
      "[data-reason]"
    )
    .forEach(button => {

      button.onclick =
        async () => {

          await db
            .collection("reports")
            .add({

              reporterId:
                currentUser.uid,

              reportedId:
                userId,

              reason:
                button.dataset.reason,

              timestamp:
                Date.now()

            });

          modal.remove();

          await customAlert(
            "Thank you. Your report has been submitted.",
            "Report submitted"
          );

        };

    });

  modal
    .querySelector(
      "#closeReportModal"
    )
    .onclick =
      () => modal.remove();

}


/* =========================================================
   STORIES
   ========================================================= */

async function uploadStory() {

  if (!supabase) {

    await customAlert(
      "Stories are currently unavailable.",
      "Stories"
    );

    return;
  }

  const input =
    document.createElement("input");

  input.type = "file";

  input.accept =
    "image/*,video/*";

  input.onchange =
    async event => {

      const file =
        event.target.files?.[0];

      if (!file) return;

      if (
        file.size >
        20 * 1024 * 1024
      ) {

        await customAlert(
          "Story files must be smaller than 20MB.",
          "File too large"
        );

        return;
      }

      const filename =
        `stories/${currentUser.uid}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g,"_")}`;

      const result =
        await supabase.storage
          .from("chat-images")
          .upload(
            filename,
            file
          );

      if (result.error) {

        await customAlert(
          "Story upload failed.",
          "Stories"
        );

        return;
      }

      await customAlert(
        "Your story has been uploaded.",
        "Story posted"
      );

    };

  input.click();
}


async function watchStories() {

  if (!supabase) {

    await customAlert(
      "Stories are currently unavailable.",
      "Stories"
    );

    return;
  }

  const result =
    await supabase.storage
      .from("chat-images")
      .list("stories", {
        limit: 30,
        sortBy: {
          column: "created_at",
          order: "desc"
        }
      });

  if (result.error) {

    await customAlert(
      "Could not load stories.",
      "Stories"
    );

    return;
  }

  const stories =
    (result.data || [])
      .filter(file =>
        /\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i
          .test(file.name)
      );

  if (!stories.length) {

    await customAlert(
      "There are no stories right now.",
      "Stories"
    );

    return;
  }

  let index = 0;

  const modal =
    document.createElement("div");

  modal.className =
    "story-modal";

  document.body.appendChild(
    modal
  );


  const show = () => {

    const file =
      stories[index];

    const url =
      supabase.storage
        .from("chat-images")
        .getPublicUrl(
          `stories/${file.name}`
        )
        .data.publicUrl;

    const video =
      /\.(mp4|webm)$/i
        .test(file.name);

    modal.innerHTML = `

      <span class="story-close">
        &times;
      </span>

      ${
        video
          ? `
            <video
              src="${escapeHTML(url)}"
              autoplay
              controls
            ></video>
          `
          : `
            <img
              src="${escapeHTML(url)}"
              alt="Story"
            >
          `
      }

      <div class="story-nav">

        <button id="previousStory">
          <i class="fas fa-chevron-left"></i>
        </button>

        <button id="nextStory">
          <i class="fas fa-chevron-right"></i>
        </button>

        <button id="uploadStory">
          <i class="fas fa-plus"></i>
        </button>

      </div>
    `;

    modal
      .querySelector(".story-close")
      .onclick =
        () => modal.remove();

    modal
      .querySelector("#previousStory")
      .onclick =
        () => {

          index =
            (index - 1 + stories.length) %
            stories.length;

          show();

        };

    modal
      .querySelector("#nextStory")
      .onclick =
        () => {

          index =
            (index + 1) %
            stories.length;

          show();

        };

    modal
      .querySelector("#uploadStory")
      .onclick =
        uploadStory;

  };

  show();

}


/* =========================================================
   EVENTS
   ========================================================= */

async function loadEvents() {

  const snapshot =
    await db
      .collection("events")
      .orderBy("date")
      .get();

  const events =
    snapshot.docs.map(
      doc => ({
        id: doc.id,
        ...doc.data()
      })
    );

  const modal =
    document.createElement("div");

  modal.className =
    "stripe-modal";

  modal.innerHTML = `

    <h3>
      📅 Connectly Events
    </h3>

    <div id="eventsList">

      ${
        events.length
        ? events.map(event => `

          <div style="
            padding:14px;
            margin:8px 0;
            border:1px solid rgba(255,255,255,.08);
            border-radius:15px;
            background:rgba(255,255,255,.04);
          ">

            <strong>
              ${escapeHTML(event.title)}
            </strong>

            <p style="
              color:#999;
              font-size:10px;
              margin-top:6px;
              line-height:1.7;
            ">

              📍 ${escapeHTML(event.location)}

              <br>

              🕒 ${
                new Date(
                  event.date
                ).toLocaleString()
              }

            </p>

            <button
              class="small-glass rsvp-btn"
              data-id="${event.id}"
            >
              ${
                (event.attendees || [])
                  .includes(currentUser.uid)
                ? "Leave"
                : "Join"
              }
            </button>

          </div>

        `).join("")
        : `
          <p style="
            color:#999;
            font-size:11px;
            padding:20px 0;
          ">
            No upcoming events.
          </p>
        `
      }

    </div>

    <div style="
      display:flex;
      gap:8px;
      margin-top:15px;
    ">

      <button
        id="createEventBtn"
        class="primary-btn"
      >
        + Create
      </button>

      <button
        id="closeEventsModal"
        class="small-glass"
      >
        Close
      </button>

    </div>

  `;

  document.body.appendChild(
    modal
  );


  modal
    .querySelectorAll(".rsvp-btn")
    .forEach(button => {

      button.onclick =
        async () => {

          const ref =
            db
              .collection("events")
              .doc(button.dataset.id);

          const snap =
            await ref.get();

          const data =
            snap.data();

          const attendees =
            data.attendees || [];

          const joined =
            attendees.includes(
              currentUser.uid
            );

          await ref.update({

            attendees:
              joined
              ? attendees.filter(
                  id =>
                    id !==
                    currentUser.uid
                )
              : [
                  ...attendees,
                  currentUser.uid
                ]

          });

          modal.remove();

          await loadEvents();

        };

    });


  modal
    .querySelector(
      "#createEventBtn"
    )
    .onclick =
      async () => {

        const title =
          await customPrompt(
            "Event title",
            "",
            "Create event"
          );

        if (!title) return;

        const location =
          await customPrompt(
            "Location",
            "",
            "Event location"
          );

        if (!location) return;

        const date =
          await customPrompt(
            "Date and time",
            "",
            "Event date"
          );

        if (!date) return;

        const timestamp =
          new Date(date).getTime();

        if (
          Number.isNaN(timestamp)
        ) {

          await customAlert(
            "Please enter a valid date.",
            "Invalid date"
          );

          return;
        }

        await db
          .collection("events")
          .add({

            title,

            location,

            date: timestamp,

            creator:
              currentUser.uid,

            attendees: [
              currentUser.uid
            ],

            createdAt:
              Date.now()

          });

        modal.remove();

        await loadEvents();

      };


  modal
    .querySelector(
      "#closeEventsModal"
    )
    .onclick =
      () => modal.remove();

}


/* =========================================================
   SETTINGS
   ========================================================= */

function showSettingsDetail(
  section
) {

  const titles = {

    account: "Account",

    privacy: "Privacy",

    dating: "Dating Preferences",

    premium: "Premium Features",

    help: "Help & Support"

  };

  $("settingsDetailTitle")
    .textContent =
      titles[section] ||
      "Settings";


  const content =
    $("settingsDetailContent");


  if (section === "account") {

    content.innerHTML = `

      <div class="edit-form">

        <label>
          Name
          <input
            value="${escapeHTML(currentUser.name)}"
            disabled
          >
        </label>

        <label>
          Email
          <input
            value="${escapeHTML(currentUser.email)}"
            disabled
          >
        </label>

        <button
          class="primary-btn"
          id="settingsEditProfile"
        >
          Edit profile
        </button>

      </div>
    `;

    $("settingsEditProfile")
      .onclick =
        () =>
          $("editProfileBtn").click();

  }


  if (section === "privacy") {

    content.innerHTML = `

      <div style="display:grid;gap:15px">

        <label>
          <input
            type="checkbox"
            id="privacyLastSeen"
            ${currentUser.privacyLastSeen !== false ? "checked" : ""}
          >
          Show last seen
        </label>

        <label>
          <input
            type="checkbox"
            id="privacyOnline"
            ${currentUser.privacyOnlineStatus !== false ? "checked" : ""}
          >
          Show online status
        </label>

        <button
          class="primary-btn"
          id="savePrivacy"
        >
          Save privacy settings
        </button>

      </div>
    `;

    $("savePrivacy").onclick =
      async () => {

        await db
          .collection("users")
          .doc(currentUser.uid)
          .update({

            privacyLastSeen:
              $("privacyLastSeen").checked,

            privacyOnlineStatus:
              $("privacyOnline").checked

          });

        await refreshCurrentUser();

        await customAlert(
          "Privacy settings saved.",
          "Saved"
        );

      };

  }


  if (section === "dating") {

    content.innerHTML = `

      <div class="edit-form">

        <label>
          Minimum age
          <input
            id="prefMinAge"
            type="number"
            value="${currentUser.prefAgeMin || 18}"
          >
        </label>

        <label>
          Maximum age
          <input
            id="prefMaxAge"
            type="number"
            value="${currentUser.prefAgeMax || 100}"
          >
        </label>

        <label>
          Distance
          <input
            id="prefDistance"
            type="number"
            value="${currentUser.prefDistance || 50}"
          >
        </label>

        <button
          id="saveDatingPrefs"
          class="primary-btn"
        >
          Save preferences
        </button>

      </div>
    `;

    $("saveDatingPrefs").onclick =
      async () => {

        await db
          .collection("users")
          .doc(currentUser.uid)
          .update({

            prefAgeMin:
              Number($("prefMinAge").value),

            prefAgeMax:
              Number($("prefMaxAge").value),

            prefDistance:
              Number($("prefDistance").value)

          });

        await refreshCurrentUser();

        await customAlert(
          "Dating preferences saved.",
          "Saved"
        );

      };

  }


  if (section === "premium") {

    content.innerHTML = `

      <div style="
        padding:20px;
        border-radius:18px;
        background:
          linear-gradient(
            135deg,
            rgba(139,92,246,.15),
            rgba(236,72,153,.08)
          );
      ">

        <h3>
          ${
            currentUser.isPremium
              ? "👑 Premium active"
              : "✨ Connectly Premium"
          }
        </h3>

        <p style="
          color:#999;
          font-size:11px;
          line-height:1.7;
          margin-top:8px;
        ">
          ${
            currentUser.isPremium
              ? `Your ${currentUser.premiumPlan || "premium"} plan is active.`
              : "Unlock more features and get more from Connectly."
          }
        </p>

        <button
          id="premiumUpgradeButton"
          class="primary-btn"
          style="margin-top:15px"
        >
          Upgrade
        </button>

      </div>
    `;

    $("premiumUpgradeButton")
      .onclick =
        showUpgradeModal;

  }


  if (section === "help") {

    content.innerHTML = `

      <div style="
        display:grid;
        gap:15px;
        line-height:1.7;
        color:#a3a6b5;
        font-size:12px;
      ">

        <div>
          <strong style="color:white">
            Need help?
          </strong>

          <p>
            Use the report and block tools
            whenever you feel uncomfortable.
          </p>
        </div>

        <div>
          <strong style="color:white">
            Account support
          </strong>

          <p>
            Contact the Connectly administrator
            for account-related issues.
          </p>
        </div>

      </div>
    `;

  }


  document
    .querySelectorAll(".view")
    .forEach(view =>
      view.classList.remove(
        "active-view"
      )
    );

  $("settingsDetailView")
    .classList.add(
      "active-view"
    );

}


$("settingsBackBtn").onclick =
  () => {

    $("settingsDetailView")
      .classList.remove(
        "active-view"
      );

    $("profileView")
      .classList.add(
        "active-view"
      );

  };


/* =========================================================
   PREMIUM
   ========================================================= */

async function showUpgradeModal() {

  const modal =
    document.createElement("div");

  modal.className =
    "custom-modal";

  modal.innerHTML = `

    <div class="custom-modal-content">

      <h3>👑 Connectly Premium</h3>

      <p>
        Upgrade to unlock premium features.
      </p>

      <div style="
        display:grid;
        gap:8px;
        margin:15px 0;
        color:#bbb;
        font-size:11px;
      ">

        <span>✨ Unlimited swipes</span>
        <span>💖 See who liked you</span>
        <span>🚀 Profile boost</span>
        <span>✓ Premium features</span>

      </div>

      <div class="custom-modal-buttons">

        <button
          id="upgradeGold"
          class="confirm-btn"
        >
          Gold
        </button>

        <button
          id="closePremium"
          class="cancel-btn"
        >
          Close
        </button>

      </div>

    </div>

  `;

  document.body.appendChild(
    modal
  );

  $("closePremium").onclick =
    () => modal.remove();

  $("upgradeGold").onclick =
    async () => {

      /*
       * Connect your actual payment provider here.
       * Do not mark users as paid solely from browser code
       * in production.
       */

      await customAlert(
        "Connect your payment provider to activate real Premium subscriptions.",
        "Premium"
      );

    };

}


/* =========================================================
   VERIFY
   ========================================================= */

async function verifyIdentity() {

  const ok =
    await customConfirm(
      "Identity verification should normally use a real verification process. Continue with the demo verification?",
      "Verification"
    );

  if (!ok) return;

  await db
    .collection("users")
    .doc(currentUser.uid)
    .update({
      verified: true
    });

  await refreshCurrentUser();

  await renderProfileUI();

  await customAlert(
    "Your profile has been marked as verified.",
    "Verified"
  );

}


/* =========================================================
   INVITES
   ========================================================= */

async function showContactsInvite() {

  const link =
    `${location.origin}/?ref=${currentUser.referralCode}`;

  if (
    navigator.share
  ) {

    try {

      await navigator.share({

        title: "Join me on Connectly",

        text:
          "Join me on Connectly!",

        url: link

      });

      return;

    } catch {}

  }

  await navigator.clipboard?.writeText(
    link
  );

  await customAlert(
    "Your invite link has been copied.",
    "Invite friends"
  );

}


/* =========================================================
   RATING
   ========================================================= */

async function showRatingModal() {

  const rating =
    await customPrompt(
      "Rate Connectly from 1 to 5",
      "5",
      "Rate Connectly"
    );

  if (!rating) return;

  const value =
    Number(rating);

  if (
    value < 1 ||
    value > 5
  ) {

    await customAlert(
      "Please enter a rating between 1 and 5.",
      "Rating"
    );

    return;
  }

  await db
    .collection("ratings")
    .add({

      userId:
        currentUser.uid,

      rating: value,

      timestamp:
        Date.now()

    });

  await customAlert(
    "Thanks for your feedback!",
    "Thank you"
  );

}


/* =========================================================
   DELETE ACCOUNT
   ========================================================= */

async function deleteAccount() {

  const ok =
    await customConfirm(
      "This will permanently remove your Connectly profile. Continue?",
      "Delete account"
    );

  if (!ok) return;

  try {

    await db
      .collection("users")
      .doc(currentUser.uid)
      .delete();

    await auth.currentUser.delete();

    localStorage.removeItem(
      "currentUserUid"
    );

    location.reload();

  } catch (error) {

    console.error(error);

    await customAlert(
      "Please sign in again before deleting your account.",
      "Delete account"
    );

  }

}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

  await db
    .collection("users")
    .doc(currentUser.uid)
    .update({
      lastSeen: 0
    })
    .catch(() => {});

  if (unsubscribeMessages)
    unsubscribeMessages();

  if (unsubscribeNotifications)
    unsubscribeNotifications();

  if (unsubscribeUser)
    unsubscribeUser();

  if (heartbeatInterval)
    clearInterval(
      heartbeatInterval
    );

  await auth.signOut();

  localStorage.removeItem(
    "currentUserUid"
  );

  location.reload();

}


/* =========================================================
   HEARTBEAT
   ========================================================= */

function startHeartbeat() {

  if (heartbeatInterval) {
    clearInterval(
      heartbeatInterval
    );
  }

  heartbeatInterval =
    setInterval(
      async () => {

        if (!currentUser) return;

        await db
          .collection("users")
          .doc(currentUser.uid)
          .update({
            lastSeen: Date.now()
          })
          .catch(() => {});

      },
      30000
    );

}


/* =========================================================
   AI
   ========================================================= */

/*
 * SECURITY:
 *
 * Do NOT put an OpenAI secret key here.
 *
 * The browser should call YOUR backend endpoint.
 *
 * Example:
 *
 * POST /api/ai
 *
 * The backend keeps OPENAI_API_KEY private.
 */

async function fetchAIResponse() {

  const response =
    await fetch(
      "/api/ai",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          messages:
            aiConversation
        })
      }
    );

  if (!response.ok) {
    throw new Error(
      "AI service unavailable"
    );
  }

  const data =
    await response.json();

  return (
    data.reply ||
    "I couldn't generate a response."
  );

}


function addAiBubble(
  text,
  sender
) {

  const bubble =
    document.createElement("div");

  bubble.className =
    `ai-message ${sender}`;

  bubble.textContent =
    text;

  $("aiChatBody")
    .appendChild(
      bubble
    );

  $("aiChatBody")
    .scrollTop =
      $("aiChatBody")
        .scrollHeight;

}


async function sendAiMessage() {

  const input =
    $("aiChatInput");

  const text =
    input.value.trim();

  if (!text) return;

  addAiBubble(
    text,
    "user"
  );

  aiConversation.push({
    role: "user",
    content: text
  });

  input.value = "";

  try {

    const reply =
      await fetchAIResponse();

    addAiBubble(
      reply,
      "bot"
    );

    aiConversation.push({
      role: "assistant",
      content: reply
    });

  } catch (error) {

    console.error(error);

    addAiBubble(
      "Connectly AI isn't connected to a backend yet. Please configure the /api/ai endpoint.",
      "bot"
    );

  }

}


/* =========================================================
   PUSH NOTIFICATIONS
   ========================================================= */

async function requestPushPermission() {

  if (
    !messaging ||
    !("Notification" in window)
  ) return;

  try {

    const permission =
      await Notification.requestPermission();

    if (
      permission !== "granted"
    ) return;

    /*
     * Keep your VAPID key configured in your
     * Firebase project. Do not expose private
     * server credentials here.
     */

  } catch (error) {

    console.warn(
      "Push notification setup failed.",
      error
    );

  }

}


/* =========================================================
   LOGIN / SIGNUP UI
   ========================================================= */

$("goToSignupLink")?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    $("loginView")
      .classList.add("hidden");

    $("signupView")
      .classList.remove("hidden");

  }
);


$("goToLoginLink")?.addEventListener(
  "click",
  event => {

    event.preventDefault();

    $("signupView")
      .classList.add("hidden");

    $("loginView")
      .classList.remove("hidden");

  }
);


$("forgotPasswordBtn")?.addEventListener(
  "click",
  async () => {

    const email =
      await customPrompt(
        "Enter your email address.",
        "",
        "Reset password"
      );

    if (!email) return;

    try {

      await auth.sendPasswordResetEmail(
        email
      );

      await customAlert(
        "Password reset instructions have been sent to your email.",
        "Email sent"
      );

    } catch (error) {

      await customAlert(
        error.message,
        "Reset password"
      );

    }

  }
);


$("googleSignInBtn")?.addEventListener(
  "click",
  async () => {

    try {

      const user =
        await signInWithGoogle();

      localStorage.setItem(
        "currentUserUid",
        user.uid
      );

      await loadCurrentUser();

      await showMainApp();

    } catch (error) {

      await customAlert(
        error.message,
        "Google sign in"
      );

    }

  }
);


$("googleSignUpBtn")?.addEventListener(
  "click",
  async () => {

    try {

      const user =
        await signInWithGoogle();

      localStorage.setItem(
        "currentUserUid",
        user.uid
      );

      await loadCurrentUser();

      await showMainApp();

    } catch (error) {

      await customAlert(
        error.message,
        "Google sign up"
      );

    }

  }
);


$("signupFormElem")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const name =
      $("signupName").value.trim();

    const email =
      $("signupEmail").value.trim();

    const password =
      $("signupPassword").value;

    const confirm =
      $("confirmPwd").value;

    const age =
      Number(
        $("signupAge").value
      );

    const gender =
      $("signupGender").value;

    const referral =
      $("signupReferralCode").value.trim();

    if (password !== confirm) {

      await customAlert(
        "Passwords do not match.",
        "Sign up"
      );

      return;
    }

    if (age < 18) {

      await customAlert(
        "You must be 18 or older to use Connectly.",
        "Age requirement"
      );

      return;
    }

    try {

      await signupUser(
        email,
        password,
        name,
        age,
        gender,
        referral
      );

      $("signupView")
        .classList.add("hidden");

      $("loginView")
        .classList.remove("hidden");

    } catch (error) {

      await customAlert(
        error.message,
        "Sign up failed"
      );

    }

  }
);


$("loginFormElem")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const email =
      $("loginEmail").value.trim();

    const password =
      $("loginPassword").value;

    try {

      const user =
        await loginUserFirebase(
          email,
          password
        );

      localStorage.setItem(
        "currentUserUid",
        user.uid
      );

      await loadCurrentUser();

      await showMainApp();

    } catch (error) {

      await customAlert(
        error.message,
        "Login failed"
      );

    }

  }
);


/* =========================================================
   PASSWORD TOGGLE
   ========================================================= */

document
  .querySelectorAll(".toggle-pwd")
  .forEach(icon => {

    icon.addEventListener(
      "click",
      () => {

        const target =
          $(icon.dataset.target);

        if (!target) return;

        target.type =
          target.type === "password"
            ? "text"
            : "password";

        icon.classList.toggle(
          "fa-eye-slash"
        );

      }
    );

  });


/* =========================================================
   FILTERS
   ========================================================= */

$("applyFilterBtn")?.addEventListener(
  "click",
  renderExplore
);


/* =========================================================
   CHAT SEARCH
   ========================================================= */

$("chatSearchInput")?.addEventListener(
  "input",
  event => {

    const term =
      event.target.value
        .toLowerCase()
        .trim();

    document
      .querySelectorAll(
        ".chat-list-item"
      )
      .forEach(item => {

        const name =
          item
            .querySelector(
              ".chat-name"
            )
            ?.textContent
            .toLowerCase() || "";

        item.style.display =
          name.includes(term)
            ? "flex"
            : "none";

      });

  }
);


/* =========================================================
   STORIES BUTTON
   ========================================================= */

$("watchStoriesBtn")?.addEventListener(
  "click",
  watchStories
);


/* =========================================================
   AI
   ========================================================= */

$("aiChatToggleBtn")?.addEventListener(
  "click",
  () => {

    const windowElement =
      $("aiChatWindow");

    windowElement.style.display =
      windowElement.style.display === "flex"
        ? "none"
        : "flex";

    if (
      windowElement.style.display ===
      "flex"
    ) {

      $("aiChatInput").focus();

    }

  }
);


$("closeAiChat")?.addEventListener(
  "click",
  () => {

    $("aiChatWindow")
      .style.display = "none";

  }
);


$("sendAiMsg")?.addEventListener(
  "click",
  sendAiMessage
);


$("aiChatInput")?.addEventListener(
  "keydown",
  event => {

    if (
      event.key === "Enter"
    ) {

      event.preventDefault();

      sendAiMessage();

    }

  }
);


/* =========================================================
   REFRESH
   ========================================================= */

$("refreshProfilesBtn")?.addEventListener(
  "click",
  async () => {

    await refreshCurrentUser();

    await renderSwipeCards();

  }
);


/* =========================================================
   MAIN APP
   ========================================================= */

async function showMainApp() {

  if (!currentUser) {

    await loadCurrentUser();

  }

  if (!currentUser) {

    $("mainApp")
      .classList.add("hidden");

    $("loginView")
      .classList.remove("hidden");

    return;

  }

  $("loginView")
    .classList.add("hidden");

  $("signupView")
    .classList.add("hidden");

  $("mainApp")
    .classList.remove("hidden");

  await renderProfileUI();

  await renderSwipeCards();

  await renderExplore();

  await renderChatList();

  attachNavigation();

  startHeartbeat();

  await requestPushPermission();

  listenForNotifications();


  if (unsubscribeUser) {
    unsubscribeUser();
  }

  unsubscribeUser =
    db
      .collection("users")
      .doc(currentUser.uid)
      .onSnapshot(
        async snapshot => {

          if (!snapshot.exists)
            return;

          currentUser =
            snapshot.data();

          await renderProfileUI();

        }
      );

}


/* =========================================================
   REFERRAL URL
   ========================================================= */

(function handleReferral() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const referral =
    params.get("ref");

  if (!referral) return;

  const signupInput =
    $("signupReferralCode");

  if (signupInput) {

    signupInput.value =
      referral;

  }

})();


/* =========================================================
   APP START
   ========================================================= */

(async function boot() {

  try {

    showLoader(true);

    const user =
      await loadCurrentUser();

    if (user) {

      try {

        if (
          auth.currentUser
        ) {

          await showMainApp();

        } else {

          $("loginView")
            .classList.remove(
              "hidden"
            );

        }

      } catch (error) {

        console.error(
          "Startup error:",
          error
        );

        localStorage.removeItem(
          "currentUserUid"
        );

        $("loginView")
          .classList.remove(
            "hidden"
          );

      }

    } else {

      $("loginView")
        .classList.remove(
          "hidden"
        );

    }

  } catch (error) {

    console.error(
      "Connectly startup error:",
      error
    );

    $("loginView")
      .classList.remove(
        "hidden"
      );

  } finally {

    showLoader(false);

  }

})();


/* =========================================================
   CLEANUP
   ========================================================= */

window.addEventListener(
  "beforeunload",
  () => {

    if (
      currentUser?.uid
    ) {

      db
        .collection("users")
        .doc(currentUser.uid)
        .update({
          lastSeen: 0
        })
        .catch(() => {});

    }

    if (heartbeatInterval) {
      clearInterval(
        heartbeatInterval
      );
    }

  }
);