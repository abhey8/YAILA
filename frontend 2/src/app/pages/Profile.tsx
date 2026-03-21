import { useState, useEffect } from "react";
import { User, Mail, Lock, Camera, Save, BookOpen } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { API_BASE_URL, dashboardApi } from "../../services/api";

export default function Profile() {
  const { user, token, updateUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    age: "",
    studySpecifications: "",
    profilePic: "",
    bio: "Passionate learner exploring AI and Machine Learning",
  });

  useEffect(() => {
    if (user) {
      setFormData((current) => ({
        ...current,
        name: user.name || "",
        email: user.email || "",
        age: user.age ? user.age.toString() : "",
        studySpecifications: user.studySpecifications || "",
        profilePic: user.profilePic || "",
      }));
    }
  }, [user]);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setIsLoadingAnalytics(true);
        const profileAnalytics = await dashboardApi.getProfileAnalytics();
        setAnalytics(profileAnalytics);
      } catch (error) {
        toast.error("Failed to load profile analytics");
      } finally {
        setIsLoadingAnalytics(false);
      }
    };

    loadAnalytics();
  }, []);

  const [passwordData, setPasswordData] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const handleSaveProfile = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          age: formData.age ? parseInt(formData.age, 10) : undefined,
          studySpecifications: formData.studySpecifications,
          profilePic: formData.profilePic,
        }),
      });

      const updatedData = await response.json();
      if (!response.ok) throw new Error(updatedData.message || "Failed to update profile");

      updateUser(updatedData);
      toast.success("Profile updated successfully!");
      setIsEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Update failed");
    }
  };

  const handleProfilePicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingPhoto(true);
      const uploadData = new FormData();
      uploadData.append("profilePic", file);

      const response = await fetch(`${API_BASE_URL}/auth/profile/photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: uploadData,
      });

      const updatedData = await response.json();
      if (!response.ok) throw new Error(updatedData.message || "Failed to upload photo");

      updateUser(updatedData);
      setFormData(prev => ({ ...prev, profilePic: updatedData.profilePic }));
      toast.success("Profile photo updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Photo upload failed");
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.new !== passwordData.confirm) {
      toast.error("New passwords don't match");
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordData.current,
          newPassword: passwordData.new,
        }),
      });

      const updatedData = await response.json();
      if (!response.ok) throw new Error(updatedData.message || "Failed to change password");

      toast.success("Password changed successfully!");
      setShowPasswordChange(false);
      setPasswordData({ current: "", new: "", confirm: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to change password");
    }
  };

  const toggleClasses =
    "w-11 h-6 rounded-full bg-[var(--surface-3)] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[var(--ring)] peer-checked:bg-[var(--accent-primary)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-[var(--border)] after:bg-[var(--surface-1)] after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-[var(--surface-1)]";

  const stats = [
    { label: "Documents Uploaded", value: analytics?.metrics?.documentsUploaded ?? 0 },
    { label: "Flashcards Collected", value: analytics?.metrics?.flashcardsCollected ?? 0 },
    { label: "Quizzes Attempted", value: analytics?.metrics?.quizzesAttempted ?? 0 },
    { label: "Study Streak", value: `${analytics?.metrics?.studyStreakDays ?? 0} days` },
  ];

  const overviewItems = [
    { label: "Learning Progress", value: `${analytics?.metrics?.learningProgressPercent ?? 0}%` },
    { label: "Mastery Score", value: `${analytics?.metrics?.masteryScore ?? 0}%` },
    { label: "Topic Coverage", value: `${analytics?.metrics?.topicCoveragePercent ?? 0}%` },
    { label: "Consistency", value: `${analytics?.metrics?.consistencyPercent ?? 0}%` },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-[var(--foreground)]">Profile Settings</h1>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="study-panel rounded-xl p-6"
      >
        <div className="flex items-start gap-6 mb-6">
          <div className="relative group">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold overflow-hidden border border-[var(--border)] shadow-[var(--shadow-soft)]"
              style={{ background: "linear-gradient(155deg, var(--accent-primary) 0%, color-mix(in srgb, var(--accent-secondary) 62%, var(--accent-primary) 38%) 100%)" }}
            >
              {formData.profilePic ? (
                <img src={formData.profilePic} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                user?.name ? user.name.charAt(0).toUpperCase() : "U"
              )}
            </div>
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              id="profilePhotoInput" 
              onChange={handleProfilePicUpload} 
              disabled={isUploadingPhoto}
            />
            <button
              onClick={() => document.getElementById("profilePhotoInput")?.click()}
              disabled={isUploadingPhoto}
              className="absolute bottom-0 right-0 w-8 h-8 study-button-primary rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full pl-11 pr-4 py-2.5 rounded-lg study-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-11 pr-4 py-2.5 rounded-lg study-input"
                    />
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                      Age
                    </label>
                    <input
                      type="number"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg study-input"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                      Study Specs
                    </label>
                    <div className="relative">
                      <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                      <input
                        type="text"
                        value={formData.studySpecifications}
                        onChange={(e) => setFormData({ ...formData, studySpecifications: e.target.value })}
                        className="w-full pl-11 pr-4 py-2.5 rounded-lg study-input"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                    Bio
                  </label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg study-input"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveProfile}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg study-button-primary"
                  >
                    <Save className="w-4 h-4" />
                    Save Changes
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-lg study-button-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-2xl font-bold text-[var(--foreground)] mb-1">{formData.name}</h2>
                <p className="text-[var(--muted-foreground)] mb-2">{formData.email}</p>
                <div className="flex flex-wrap gap-3 text-sm mb-4 items-center">
                  {formData.age ? <span>{formData.age} Years Old</span> : null}
                  {formData.studySpecifications ? (
                    <span className="study-chip rounded-full px-3 py-1 flex items-center gap-1">
                      <BookOpen className="w-4 h-4" /> {formData.studySpecifications}
                    </span>
                  ) : null}
                </div>
                <p className="text-[var(--foreground-soft)] mb-4 leading-7">{formData.bio}</p>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 rounded-lg study-button-primary"
                >
                  Edit Profile
                </button>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="study-panel-quiet rounded-xl p-4 text-center"
          >
            <div className="text-2xl font-bold text-[var(--foreground)] mb-1">
              {isLoadingAnalytics ? "..." : stat.value}
            </div>
            <div className="text-sm text-[var(--muted-foreground)]">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="study-panel rounded-xl p-6"
        >
          <h3 className="text-xl font-bold text-[var(--foreground)] mb-6">Learning Overview</h3>
          <div className="space-y-4">
            {overviewItems.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[var(--foreground-soft)]">{item.label}</span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {isLoadingAnalytics ? "..." : item.value}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-primary)]"
                    style={{ width: `${parseInt(item.value, 10) || 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="study-panel rounded-xl p-6"
        >
          <h3 className="text-xl font-bold text-[var(--foreground)] mb-6">Recent Activity</h3>
          <div className="space-y-3">
            {analytics?.recentActivity?.length ? analytics.recentActivity.map((item: any) => (
              <div key={item.id} className="study-panel-quiet rounded-xl p-4">
                <div className="text-sm font-medium text-[var(--foreground)]">{item.title}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-1">{item.description}</div>
                {item.document ? (
                  <div className="text-[11px] text-[var(--accent-primary)] mt-2">{item.document.title}</div>
                ) : null}
              </div>
            )) : (
              <div className="text-sm text-[var(--muted-foreground)]">No recent activity yet.</div>
            )}
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="study-panel rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-[var(--foreground)] mb-6">Security</h3>

        {!showPasswordChange ? (
          <button
            onClick={() => setShowPasswordChange(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg study-button-secondary"
          >
            <Lock className="w-4 h-4" />
            Change Password
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={passwordData.current}
                onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg study-input"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                New Password
              </label>
              <input
                type="password"
                value={passwordData.new}
                onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg study-input"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--foreground-soft)] mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={passwordData.confirm}
                onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg study-input"
                placeholder="••••••••"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleChangePassword}
                className="px-4 py-2 rounded-lg study-button-primary"
              >
                Update Password
              </button>
              <button
                onClick={() => {
                  setShowPasswordChange(false);
                  setPasswordData({ current: "", new: "", confirm: "" });
                }}
                className="px-4 py-2 rounded-lg study-button-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="study-panel rounded-xl p-6"
      >
        <h3 className="text-xl font-bold text-[var(--foreground)] mb-6">Preferences</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[var(--foreground)]">Email Notifications</p>
              <p className="text-sm text-[var(--muted-foreground)]">Receive updates about your progress</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className={toggleClasses}></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[var(--foreground)]">Study Reminders</p>
              <p className="text-sm text-[var(--muted-foreground)]">Get reminded to review flashcards</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className={toggleClasses}></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-[var(--foreground)]">Dark Mode</p>
              <p className="text-sm text-[var(--muted-foreground)]">Switch to dark theme</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" checked={theme === "dark"} onChange={toggleTheme} />
              <div className={toggleClasses}></div>
            </label>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
