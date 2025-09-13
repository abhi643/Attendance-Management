import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';

function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Sign in with Supabase Auth
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                console.error('Auth error:', error);
                toast.error(error.message);
                return;
            }

            console.log('✅ Auth successful! User ID:', data.user.id);
            console.log('✅ User email:', data.user.email);

            // Check if user is an admin - using maybeSingle() instead of single()
            const { data: adminData, error: adminError } = await supabase
                .from('admins')
                .select('admin_email, user_id')
                .eq('user_id', data.user.id)
                .maybeSingle(); // This won't throw 406 if no rows found

            console.log('🔍 Admin query result:', { adminData, adminError });

            if (adminError) {
                console.error('❌ Admin check database error:', adminError);
                toast.error('Database error: ' + adminError.message);
                return;
            }

            if (!adminData) {
                console.error('❌ No admin record found for user:', data.user.id);
                await supabase.auth.signOut();
                toast.error('Access denied. No admin record found for this user.');
                return;
            }

            console.log('✅ Admin check passed!');
            toast.success('Login successful!');
            navigate('/dashboard');

        } catch (err) {
            console.error('❌ Unexpected login error:', err);
            toast.error('Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mt-5">
            <div className="row justify-content-center">
                <div className="col-md-6">
                    <div className="card">
                        <div className="card-header">
                            <h3 className="text-center">Admin Login</h3>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSubmit}>
                                <div className="mb-3">
                                    <label htmlFor="email" className="form-label">Email</label>
                                    <input
                                        type="email"
                                        className="form-control"
                                        id="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="mb-3">
                                    <label htmlFor="password" className="form-label">Password</label>
                                    <input
                                        type="password"
                                        className="form-control"
                                        id="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>
                                <button
                                    type="submit"
                                    className="btn btn-primary w-100"
                                    disabled={loading}
                                >
                                    {loading ? 'Signing in...' : 'Login'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
