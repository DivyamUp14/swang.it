import React, { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import Button from '../ui/Button.jsx';
import { FaTimes, FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt, FaEuroSign, FaClock, FaCalendarAlt } from 'react-icons/fa';

export default function UserProfileModal({ userId, onClose }) {
    const { token, apiBase } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (userId) loadUser();
    }, [userId]);

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const loadUser = async () => {
        try {
            setLoading(true);
            const headers = { Authorization: `Bearer ${token}` };
            // Assuming ngrok skip logic is consistent across app
            if ((apiBase || '').includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
            const res = await fetch(`${apiBase}/api/admin/users/${userId}`, { headers });
            if (res.ok) {
                const json = await res.json();
                setData(json);
            }
        } catch (error) {
            console.error('Failed to load user', error);
        } finally {
            setLoading(false);
        }
    };

    if (!userId) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
                    <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <FaUser className="text-indigo-600" />
                        Full Profile Details
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100">
                        <FaTimes size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center items-center py-20">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                        </div>
                    ) : data ? (
                        <div className="space-y-8">
                            {/* User Basic Info Section */}
                            <div>
                                <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">User Information</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <InfoItem icon={FaUser} label="User ID" value={data.user.id} />
                                    <InfoItem icon={FaEnvelope} label="Email" value={data.user.email} />
                                    <InfoItem icon={FaUser} label="Full Name" value={data.profile?.name || data.user.full_name || 'N/A'} />
                                    <InfoItem icon={FaPhone} label="Phone" value={data.profile?.phone || data.user.phone || 'N/A'} />
                                    {data.user.nickname && <InfoItem icon={FaUser} label="Nickname" value={data.user.nickname} />}
                                    <InfoItem icon={FaMapMarkerAlt} label="Location" value={[data.user.city, data.user.country].filter(Boolean).join(', ') || 'N/A'} />
                                    <InfoItem icon={FaClock} label="Timezone" value={data.user.timezone || 'UTC'} />
                                    <InfoItem icon={FaCalendarAlt} label="Joined At" value={new Date(data.user.created_at).toLocaleString()} />
                                    <InfoItem icon={FaUser} label="Role" value={<span className="capitalize font-medium">{data.user.role}</span>} />
                                    <InfoItem icon={FaEuroSign} label="Wallet Balance" value={<span className="font-bold text-green-600">€{Number(data.user.credits || 0).toFixed(2)}</span>} />
                                    <InfoItem icon={FaUser} label="Received Bonus" value={data.user.bonus_granted ? 'Yes' : 'No'} />
                                </div>
                            </div>

                            {/* Consultant Profile Section */}
                            {data.profile && (
                                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                                    <h3 className="text-lg font-semibold text-indigo-700 mb-4 border-b border-gray-200 pb-2">Consultant Profile</h3>

                                    <div className="flex flex-col md:flex-row gap-6 mb-6">
                                        {data.profile.profile_photo && (
                                            <div className="flex-shrink-0">
                                                <img
                                                    src={`${apiBase}${data.profile.profile_photo}`}
                                                    alt="Profile"
                                                    className="w-32 h-32 rounded-lg object-cover shadow-sm border border-gray-200"
                                                    onError={(e) => { e.target.src = 'https://via.placeholder.com/150?text=No+Img'; }}
                                                />
                                            </div>
                                        )}
                                        <div className="flex-1 space-y-4">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <InfoItem label="Status" value={<StatusBadge status={data.profile.status} />} />
                                                <InfoItem label="Macro Category" value={<span className="capitalize">{data.profile.macro_category}</span>} />
                                                <InfoItem label="Contract Agreed" value={data.profile.contract_agreed ? 'Yes' : 'No'} />
                                                <InfoItem label="Rating" value={`${Number(data.profile.rating || 0).toFixed(1)}/5 (${data.profile.review_count} reviews)`} />
                                            </div>

                                            <div>
                                                <span className="text-sm text-gray-500 block mb-1">Pricing</span>
                                                <div className="flex gap-4 flex-wrap">
                                                    <PriceTag label="Chat" price={data.profile.chat_price} />
                                                    <PriceTag label="Voice" price={data.profile.voice_price} />
                                                    <PriceTag label="Video" price={data.profile.video_price} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <span className="text-sm font-medium text-gray-500 block mb-1">Expertise (Micro-categories)</span>
                                            <div className="flex flex-wrap gap-2">
                                                {(() => {
                                                    try {
                                                        const cats = typeof data.profile.micro_categories === 'string'
                                                            ? JSON.parse(data.profile.micro_categories)
                                                            : data.profile.micro_categories;
                                                        return Array.isArray(cats) && cats.length > 0
                                                            ? cats.map((cat, i) => <span key={i} className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm text-gray-700">{cat}</span>)
                                                            : <span className="text-gray-400 italic">None selected</span>;
                                                    } catch { return <span className="text-gray-400">Error parsing categories</span> }
                                                })()}
                                            </div>
                                        </div>

                                        <div>
                                            <span className="text-sm font-medium text-gray-500 block mb-1">Bio</span>
                                            <p className="text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 text-sm">{data.profile.bio || 'No bio provided'}</p>
                                        </div>

                                        <div>
                                            <span className="text-sm font-medium text-gray-500 block mb-1">Experience</span>
                                            <p className="text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200 text-sm">{data.profile.experience || 'No experience provided'}</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                            {data.profile.tax_code && <InfoItem label="Tax Code" value={data.profile.tax_code} />}
                                            {data.profile.iban && <InfoItem label="IBAN" value={data.profile.iban} />}
                                            {data.profile.address && <InfoItem label="Address" value={data.profile.address} fullWidth />}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-8 rounded text-center">
                            User data not available.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-lg">
                    <Button onClick={onClose} variant="secondary">Close</Button>
                </div>
            </div>
        </div>
    );
}

const InfoItem = ({ icon: Icon, label, value, fullWidth = false }) => (
    <div className={`${fullWidth ? 'col-span-full' : ''}`}>
        <dt className="text-sm font-medium text-gray-500 flex items-center gap-1 mb-1">
            {Icon && <Icon className="text-gray-400" size={12} />}
            {label}
        </dt>
        <dd className="text-gray-900 font-medium break-words">{value}</dd>
    </div>
);

const PriceTag = ({ label, price }) => (
    <div className="bg-white px-3 py-1 rounded border border-green-200 text-green-700 text-sm font-medium flex items-center gap-1">
        <span>{label}:</span>
        <span>€{Number(price || 0).toFixed(2)}</span>
    </div>
);

const StatusBadge = ({ status }) => {
    const styles = {
        active: 'bg-green-100 text-green-800',
        pending: 'bg-yellow-100 text-yellow-800',
        inactive: 'bg-red-100 text-red-800'
    };
    return (
        <span className={`px-2 py-1 text-xs rounded uppercase font-bold tracking-wide ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
            {status}
        </span>
    );
};
