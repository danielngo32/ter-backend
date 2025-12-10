const BACKGROUND_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
  '#F8C471', '#82E0AA', '#F1948A', '#85C1E9', '#D7BDE2'
];

const getAvatarBackgroundColor = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % BACKGROUND_COLORS.length;
  return BACKGROUND_COLORS[index];
};

const generateDefaultAvatarUrl = (fullName) => {
  const firstLetter = fullName.charAt(0).toUpperCase();
  const backgroundColor = getAvatarBackgroundColor(fullName);
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(firstLetter)}&background=${backgroundColor.replace('#', '')}&color=fff&size=200&format=png`;
};

const isDefaultAvatar = (avatarUrl) => {
  if (!avatarUrl) return true;
  return avatarUrl.includes('ui-avatars.com/api/');
};

module.exports = {
  generateDefaultAvatarUrl,
  getAvatarBackgroundColor,
  isDefaultAvatar,
};