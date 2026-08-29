// Category mapping lookup
const categoryLabels = {
  "poor-drainage": "Poor Drainage System",
  "heavy-rainfall": "Heavy Rainfall",
  "blocked-sewers": "Blocked Sewers",
  "infrastructure-issues": "Infrastructure Issues",
  "construction-work": "Construction Work",
  "natural-disaster": "Natural Disaster",
  "overflow": "Overflow from Water Bodies",
  "other": "Other",
};

// Category badge styling map for variety
const categoryBadgeColors = {
  "poor-drainage": "bg-amber-100 text-amber-800 border-amber-200",
  "heavy-rainfall": "bg-blue-100 text-blue-800 border-blue-200",
  "blocked-sewers": "bg-red-100 text-red-800 border-red-200",
  "infrastructure-issues": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "construction-work": "bg-orange-100 text-orange-800 border-orange-200",
  "natural-disaster": "bg-purple-100 text-purple-800 border-purple-200",
  "overflow": "bg-teal-100 text-teal-800 border-teal-200",
  "other": "bg-gray-100 text-gray-800 border-gray-200",
};

// Preloaded Mock Data
const mockReports = [
  {
    id: "mock-1",
    imageUrl: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=600&auto=format&fit=crop",
    address: "Hill Road near Metro Station, Block C",
    category: "poor-drainage",
    consequences: "Major traffic delays, pedestrians cannot cross the service lane without wading through waist-deep water.",
    timestamp: "8/1/2026, 10:15:30 AM",
    comments: [
      {
        id: "c1",
        text: "This happens every year at the start of monsoon. The storm drains have been clogged since the roadwork last winter.",
        timestamp: "8/1/2026, 10:30:15 AM"
      },
      {
        id: "c2",
        text: "Thanks for reporting. Will avoid this route on my commute home.",
        timestamp: "8/1/2026, 10:45:00 AM"
      }
    ]
  },
  {
    id: "mock-2",
    imageUrl: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=600&auto=format&fit=crop",
    address: "Market Square Area, Lane 4",
    category: "blocked-sewers",
    consequences: "Smelly sewer water overflowing onto storefront pathways. Bad health hazard for kids and shopkeepers.",
    timestamp: "7/31/2026, 4:20:10 PM",
    comments: [
      {
        id: "c3",
        text: "Health inspectors need to look into this. The stench is unbearable.",
        timestamp: "7/31/2026, 5:10:00 PM"
      }
    ]
  }
];

// Local State
const state = {
  currentPage: "landing",
  reports: [],
  selectedImage: null,
  openComments: {} // Keeps track of reportId -> boolean mapping for comments collapse
};

// Sidebar Drawer Toggle Logic
function initSidebar() {
  const toggleBtn = document.getElementById("sidebar-toggle");
  const closeBtn = document.getElementById("sidebar-close");
  const overlay = document.getElementById("sidebar-overlay");
  const menu = document.getElementById("sidebar-menu");

  if (!toggleBtn || !closeBtn || !overlay || !menu) return;

  function openSidebar() {
    overlay.classList.remove("pointer-events-none", "opacity-0");
    overlay.classList.add("opacity-100");
    menu.classList.remove("translate-x-full");
    document.body.classList.add("sidebar-open");
  }

  function closeSidebar() {
    overlay.classList.add("pointer-events-none", "opacity-0");
    overlay.classList.remove("opacity-100");
    menu.classList.add("translate-x-full");
    document.body.classList.remove("sidebar-open");
  }

  toggleBtn.addEventListener("click", openSidebar);
  closeBtn.addEventListener("click", closeSidebar);
  overlay.addEventListener("click", closeSidebar);

  // Close sidebar when clicking any navigation link inside it
  const sidebarLinks = menu.querySelectorAll("nav a");
  sidebarLinks.forEach(link => {
    link.addEventListener("click", closeSidebar);
  });
}

// Hydrate application state
function initApp() {
  // Fetch from localstorage or use mock reports if none exists
  const savedReports = localStorage.getItem("water_clogging_reports");
  if (savedReports) {
    state.reports = JSON.parse(savedReports);
  } else {
    state.reports = [...mockReports];
    localStorage.setItem("water_clogging_reports", JSON.stringify(state.reports));
  }
  
  // Update reports count on badge
  updateStats();
  
  // Render reports list if container exists
  renderReports();
  
  // Hydrate Lucide Icons
  lucide.createIcons();
  
  // Initialize mobile sidebar
  initSidebar();
}

// Navigates between views
function navigateTo(page) {
  const landing = document.getElementById("landing-page");
  const reporting = document.getElementById("reporting-page");

  // Smooth opacity switch
  if (page === "reporting") {
    state.currentPage = "reporting";
    
    // Hide landing and show reporting
    landing.classList.add("hidden");
    reporting.classList.remove("hidden");
    
    // Smooth entry animation class
    reporting.classList.add("fade-enter");
    setTimeout(() => {
      reporting.classList.add("fade-enter-active");
    }, 10);
    
    renderReports();
  } else {
    state.currentPage = "landing";
    
    // Hide reporting and show landing
    reporting.classList.add("hidden");
    reporting.classList.remove("fade-enter", "fade-enter-active");
    landing.classList.remove("hidden");
    
    landing.classList.add("fade-enter");
    setTimeout(() => {
      landing.classList.add("fade-enter-active");
    }, 10);
  }

  updateStats();
  // Recalculate icons on navigation
  setTimeout(() => lucide.createIcons(), 50);
}

// Update global report statistics / badges
function updateStats() {
  const totalCount = state.reports.length;
  
  // Update landing page floating badge count
  const badge = document.getElementById("total-reports-badge");
  if (badge) {
    // Base + custom submissions
    const displayCount = 1234 + (totalCount - mockReports.length);
    badge.innerText = displayCount.toLocaleString() + "+";
  }

  // Update reporting page tab count
  const tabBadge = document.getElementById("reports-count-badge");
  if (tabBadge) {
    tabBadge.innerText = `${totalCount} ${totalCount === 1 ? 'report' : 'reports'}`;
  }
}

// Toast utility
function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  const toastMessage = document.getElementById("toast-message");
  const iconContainer = document.getElementById("toast-icon-container");
  
  toastMessage.innerText = message;
  
  if (type === "success") {
    iconContainer.className = "rounded-full p-1 bg-green-500";
    iconContainer.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-white"></i>';
  } else {
    iconContainer.className = "rounded-full p-1 bg-red-500";
    iconContainer.innerHTML = '<i data-lucide="alert-triangle" class="w-4 h-4 text-white"></i>';
  }
  
  // Force lucide update inside toast
  lucide.createIcons();
  
  // Show toast
  toast.classList.remove("translate-y-12", "opacity-0", "pointer-events-none");
  toast.classList.add("translate-y-0", "opacity-100");
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.classList.add("translate-y-12", "opacity-0", "pointer-events-none");
    toast.classList.remove("translate-y-0", "opacity-100");
  }, 3000);
}

// Handle Upload Preview
function processImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate size (< 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast("Image size must be less than 5MB", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    state.selectedImage = e.target.result;
    
    // Show preview, hide placeholder
    document.getElementById("image-upload-placeholder").classList.add("hidden");
    const previewContainer = document.getElementById("image-upload-preview-container");
    previewContainer.classList.remove("hidden");
    document.getElementById("image-preview").src = state.selectedImage;
    
    lucide.createIcons();
  };
  reader.readAsDataURL(file);
}

// Reset uploaded image
function removeUploadedImage() {
  state.selectedImage = null;
  document.getElementById("image-upload-input").value = "";
  document.getElementById("image-upload-preview-container").classList.add("hidden");
  document.getElementById("image-upload-placeholder").classList.remove("hidden");
  lucide.createIcons();
}

// Handles submitting the reports form
function handleFormSubmit(event) {
  event.preventDefault();

  if (!state.selectedImage) {
    showToast("Please upload an image of the logged water", "error");
    return;
  }

  const addressInput = document.getElementById("form-address");
  const categorySelect = document.getElementById("form-category");
  const consequencesInput = document.getElementById("form-consequences");
  const submitBtn = document.getElementById("submit-button");

  const address = addressInput.value.trim();
  const category = categorySelect.value;
  const consequences = consequencesInput.value.trim();

  if (!address || !category || !consequences) {
    showToast("Please fill in all the required fields", "error");
    return;
  }

  // Disable submission button
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    <span>Submitting...</span>
  `;

  // Simulating a minor network latency delay
  setTimeout(() => {
    const newReport = {
      id: "rep-" + Date.now(),
      imageUrl: state.selectedImage,
      address: address,
      category: category,
      consequences: consequences,
      timestamp: new Date().toLocaleString(),
      comments: []
    };

    // Add to state and persist
    state.reports.unshift(newReport);
    localStorage.setItem("water_clogging_reports", JSON.stringify(state.reports));

    // Reset form UI
    addressInput.value = "";
    categorySelect.value = "";
    consequencesInput.value = "";
    removeUploadedImage();

    // Restore Submit button
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Submit Report</span>`;

    showToast("Water logged area reported successfully!");
    updateStats();
    renderReports();
  }, 600);
}

// Toggle comments collapse
function toggleComments(reportId) {
  state.openComments[reportId] = !state.openComments[reportId];
  
  const panel = document.getElementById(`comments-panel-${reportId}`);
  if (state.openComments[reportId]) {
    panel.classList.remove("hidden");
  } else {
    panel.classList.add("hidden");
  }
  
  lucide.createIcons();
}

// Add a comment to a report
function handleAddComment(event, reportId) {
  event.preventDefault();
  
  const input = document.getElementById(`comment-input-${reportId}`);
  const text = input.value.trim();
  if (!text) return;

  const newComment = {
    id: "comm-" + Date.now(),
    text: text,
    timestamp: new Date().toLocaleString()
  };

  // Find report and append comment
  state.reports = state.reports.map(report => {
    if (report.id === reportId) {
      return {
        ...report,
        comments: [...report.comments, newComment]
      };
    }
    return report;
  });

  // Save to localStorage
  localStorage.setItem("water_clogging_reports", JSON.stringify(state.reports));

  // Reset form
  input.value = "";

  // Re-render
  renderReports();
  showToast("Comment added!");
}

// Render reports lists dynamically
function renderReports() {
  const container = document.getElementById("reports-list-container");
  if (!container) return;
  
  if (state.reports.length === 0) {
    container.className = "col-span-1 md:col-span-2 bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm";
    container.innerHTML = `
      <i data-lucide="alert-circle" class="w-12 h-12 mx-auto text-gray-300 mb-3"></i>
      <p class="text-gray-600 font-semibold">No reports yet</p>
      <p class="text-xs text-gray-400 mt-1">Submit the first report to get started</p>
    `;
    lucide.createIcons();
    return;
  }

  container.className = "grid grid-cols-1 md:grid-cols-2 gap-6";
  
  let html = "";
  state.reports.forEach(report => {
    const categoryLabel = categoryLabels[report.category] || report.category;
    const badgeColor = categoryBadgeColors[report.category] || "bg-gray-100 text-gray-800 border-gray-200";
    const commentCount = report.comments.length;
    const isCommentsOpen = state.openComments[report.id] || false;
    
    let commentsListHtml = "";
    report.comments.forEach(comment => {
      commentsListHtml += `
        <div class="bg-gray-50 rounded-xl p-3 border border-gray-100/50">
          <p class="text-sm text-gray-700 leading-relaxed">${comment.text}</p>
          <p class="text-[10px] text-gray-400 mt-1.5 font-medium flex items-center gap-1">
            <i data-lucide="clock" class="w-3 h-3"></i> ${comment.timestamp}
          </p>
        </div>
      `;
    });

    html += `
      <div class="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100 flex flex-col justify-between">
        <div>
          <!-- Report Image -->
          <div class="aspect-video w-full overflow-hidden bg-gray-100 border-b border-gray-100">
            <img
              src="${report.imageUrl}"
              alt="Water logged area"
              class="h-full w-full object-cover hover:scale-105 transition-transform duration-500"
            />
          </div>
          
          <!-- Content -->
          <div class="p-5 space-y-4">
            <div class="flex items-start gap-2.5">
              <i data-lucide="map-pin" class="w-4 h-4 mt-1 text-blue-600 flex-shrink-0"></i>
              <p class="text-sm font-semibold text-gray-700 leading-relaxed">${report.address}</p>
            </div>
            
            <div class="flex items-center">
              <span class="text-xs font-semibold px-2.5 py-1 rounded-full border ${badgeColor}">
                ${categoryLabel}
              </span>
            </div>

            <div class="space-y-1 pt-1">
              <div class="flex items-start gap-2.5">
                <i data-lucide="alert-triangle" class="w-4 h-4 mt-1 text-orange-500 flex-shrink-0"></i>
                <div>
                  <p class="text-xs font-bold text-gray-500 uppercase tracking-wider">Impact</p>
                  <p class="text-sm text-gray-600 leading-relaxed mt-0.5">${report.consequences}</p>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2 text-xs font-medium text-gray-400">
              <i data-lucide="calendar" class="w-4 h-4 text-gray-400"></i>
              <span>${report.timestamp}</span>
            </div>
          </div>
        </div>

        <!-- Footer & Comment Area -->
        <div class="border-t border-gray-100 bg-gray-50/50 p-4">
          <button
            type="button"
            onclick="toggleComments('${report.id}')"
            class="w-full bg-white hover:bg-gray-50 border border-gray-200/80 rounded-xl py-2 px-3 text-xs font-semibold text-gray-700 hover:text-gray-950 transition-colors shadow-sm flex items-center justify-between cursor-pointer"
          >
            <span class="flex items-center gap-2">
              <i data-lucide="message-circle" class="w-4 h-4 text-gray-500"></i>
              <span>${commentCount} ${commentCount === 1 ? 'Comment' : 'Comments'}</span>
            </span>
            <i data-lucide="${isCommentsOpen ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-gray-400"></i>
          </button>

          <!-- Collapsible Comments Panel -->
          <div id="comments-panel-${report.id}" class="${isCommentsOpen ? '' : 'hidden'} space-y-4 pt-4">
            <!-- Comments list -->
            <div class="space-y-2 max-h-48 overflow-y-auto pr-1 comments-scrollbar">
              ${commentCount > 0 ? commentsListHtml : '<p class="text-xs text-gray-400 italic text-center py-2">No comments yet. Be the first to reply!</p>'}
            </div>

            <!-- Add Comment Form -->
            <form onsubmit="handleAddComment(event, '${report.id}')" class="flex gap-2">
              <input
                id="comment-input-${report.id}"
                type="text"
                required
                placeholder="Add a comment..."
                class="flex-1 min-w-0 bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <button 
                type="submit" 
                class="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-2 transition-colors flex items-center justify-center cursor-pointer flex-shrink-0"
              >
                <i data-lucide="send" class="w-3.5 h-3.5"></i>
              </button>
            </form>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
  lucide.createIcons();
}

// Auto initialize app on script execution
window.addEventListener("DOMContentLoaded", initApp);

// Header Scroll Behavior (Glassmorphism Effect)
let isScrolled = false;

function checkHeaderScroll() {
  const scrollPos = window.scrollY;
  const headers = document.querySelectorAll('.header-glass');
  if (scrollPos > 50) {
    headers.forEach(header => header.classList.add('scrolled'));
    isScrolled = true;
  } else {
    headers.forEach(header => header.classList.remove('scrolled'));
    isScrolled = false;
  }
}

// Single passive scroll event listener for optimal performance
window.addEventListener('scroll', function() {
  const scrollPos = window.scrollY;
  if (scrollPos > 10 && !isScrolled) {
    document.querySelectorAll('.header-glass').forEach(header => header.classList.add('scrolled'));
    isScrolled = true;
  } else if (scrollPos <= 50 && isScrolled) {
    document.querySelectorAll('.header-glass').forEach(header => header.classList.remove('scrolled'));
    isScrolled = false;
  }
}, { passive: true });

// Check scroll state on DOM ready to handle page refreshes at scrolled positions
window.addEventListener('DOMContentLoaded', checkHeaderScroll);

