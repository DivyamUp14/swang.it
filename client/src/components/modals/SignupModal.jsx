import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiX, HiArrowRight } from 'react-icons/hi';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { useAuth } from '../../auth/AuthContext';

const SignupModal = ({ isOpen, onClose, onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // For now, just navigate to signup page
      // In real implementation, this would handle the first step
      onClose();
      navigate('/signup', { state: { email } });
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-2">
          <div className="bg-green-500 text-white px-2 py-1 rounded text-sm font-bold">
            SWANG
          </div>
          <span className="text-sm font-semibold">.IT</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors rounded-full p-1 hover:bg-gray-100"
        >
          <HiX className="w-6 h-6" />
        </button>
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-bold text-blue-600 mb-2">
          Sign up and take advantage of 5 minutes of free consultation
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          to find answers to your questions
        </p>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-start space-x-2">
              <HiArrowRight className="w-5 h-5 text-black mt-0.5" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-start space-x-2">
              <HiArrowRight className="w-5 h-5 text-black mt-0.5" />
              <span>Confidential consultations</span>
            </div>
          </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <Input
          label="Email Address"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Button
          type="submit"
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={loading || !email}
        >
          {loading ? 'CONTINUING...' : 'CONTINUE'}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => {
            onClose();
            onSwitchToLogin();
          }}
          className="text-sm text-blue-600 hover:underline"
        >
          I already have an account, connect me
        </button>
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        By continuing, you agree to our{' '}
        <a href="/terms" className="text-blue-600 hover:underline">Terms of Service</a>
        {' '}and{' '}
        <a href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</a>
      </div>
    </Modal>
  );
};

export default SignupModal;

