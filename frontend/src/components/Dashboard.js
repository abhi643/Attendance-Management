import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { supabase } from '../lib/supabase';

function Dashboard() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaveRecords, setLeaveRecords] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState(null);
  const [newEmployee, setNewEmployee] = useState({ name: '', designation: '' });
  const [newLeave, setNewLeave] = useState({
    employee_id: '',
    leave_reason: '',
    leave_type: 'sick',
    duration: 'full_day',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const [isLoading, setIsLoading] = useState(true);
  const [bulkStatus, setBulkStatus] = useState('');

  // Updated timing constants with half-day support
  const DEFAULT_CHECK_IN = '10:30:00';
  const DEFAULT_CHECK_OUT = '18:30:00';
  const HALF_DAY_MORNING_IN = '10:30:00';
  const HALF_DAY_MORNING_OUT = '14:30:00';
  const HALF_DAY_AFTERNOON_IN = '14:30:00';
  const HALF_DAY_AFTERNOON_OUT = '18:30:00';

  // Helper function to format time for database
  const formatTimeForDB = (timeString) => {
    if (!timeString) return null;
    if (typeof timeString === 'string') {
      if (timeString.match(/^\d{2}:\d{2}:\d{2}$/)) {
        return timeString;
      }
      if (timeString.match(/^\d{2}:\d{2}$/)) {
        return `${timeString}:00`;
      }
    }
    return timeString;
  };

  // Helper function to format time for display (HH:MM)
  const formatTimeForDisplay = (timeString) => {
    if (!timeString) return '';
    if (typeof timeString === 'string' && timeString.includes(':')) {
      return timeString.substring(0, 5);
    }
    return timeString || '';
  };

  // Get default times based on status
  const getDefaultTimes = (status) => {
    switch(status) {
      case 'present':
        return { checkIn: DEFAULT_CHECK_IN, checkOut: DEFAULT_CHECK_OUT };
      case 'half_day_morning':
        return { checkIn: HALF_DAY_MORNING_IN, checkOut: HALF_DAY_MORNING_OUT };
      case 'half_day_afternoon':
        return { checkIn: HALF_DAY_AFTERNOON_IN, checkOut: HALF_DAY_AFTERNOON_OUT };
      case 'absent':
      case 'on_leave':
        return { checkIn: null, checkOut: null };
      default:
        return { checkIn: DEFAULT_CHECK_IN, checkOut: DEFAULT_CHECK_OUT };
    }
  };

  // Helper function to calculate date difference
  const calculateDateDifference = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
  };

  // Helper function to check if a date is within a leave period
  const isDateInLeavePeriod = (checkDate, leave) => {
    const check = new Date(checkDate);
    const start = new Date(leave.start_date || leave.leave_date);
    const end = new Date(leave.end_date || leave.leave_date);
    return check >= start && check <= end;
  };

  // Helper functions for date navigation
  const changeDate = (days) => {
    const newDate = new Date(date);
    newDate.setDate(newDate.getDate() + days);
    setDate(newDate.toISOString().split('T')[0]);
  };

  const goToToday = () => setDate(new Date().toISOString().split('T')[0]);

  // Updated late/early detection with status-aware logic
  const isLateArrival = (checkInTime, status) => {
    if (!checkInTime || status === 'absent' || status === 'on_leave') return false;
    const expectedTime = getDefaultTimes(status).checkIn;
    const checkTime = formatTimeForDisplay(checkInTime);
    const expectedTimeDisplay = formatTimeForDisplay(expectedTime);
    return checkTime > expectedTimeDisplay;
  };

  const isEarlyDeparture = (checkOutTime, status) => {
    if (!checkOutTime || status === 'absent' || status === 'on_leave') return false;
    const expectedTime = getDefaultTimes(status).checkOut;
    const checkTime = formatTimeForDisplay(checkOutTime);
    const expectedTimeDisplay = formatTimeForDisplay(expectedTime);
    return checkTime < expectedTimeDisplay;
  };

  // Updated statistics calculation
  const getAttendanceStats = () => {
    const stats = {
      present: 0,
      absent: 0,
      halfDayMorning: 0,
      halfDayAfternoon: 0,
      onLeave: 0,
      late: 0,
      early: 0
    };

    attendance.forEach(record => {
      if (record.status === 'present') stats.present++;
      else if (record.status === 'absent') stats.absent++;
      else if (record.status === 'half_day_morning') stats.halfDayMorning++;
      else if (record.status === 'half_day_afternoon') stats.halfDayAfternoon++;
      else if (record.status === 'on_leave') stats.onLeave++;

      if (isLateArrival(record.check_in_time, record.status)) stats.late++;
      if (isEarlyDeparture(record.check_out_time, record.status)) stats.early++;
    });

    return stats;
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Employee Name', 'Status', 'Check In', 'Check Out', 'Notes'];
    const csvContent = [
      headers.join(','),
      ...attendance.map(record => {
        const emp = employees.find(e => e.employee_id === record.employee_id);
        return [
          emp?.employee_name || '',
          record.status,
          formatTimeForDisplay(record.check_in_time) || '',
          formatTimeForDisplay(record.check_out_time) || '',
          `"${record.notes || ''}"`
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', `attendance-${date}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Attendance exported successfully!');
  };

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('You are not logged in.');
          navigate('/');
          return;
        }

        const { data: adminData, error } = await supabase
          .from('admins')
          .select('admin_email')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error || !adminData) {
          toast.error('Access denied. Admin privileges required.');
          await supabase.auth.signOut();
          navigate('/');
          return;
        }

        setAdmin({
          adminId: user.id,
          adminEmail: adminData.admin_email
        });
      } catch (error) {
        console.error('Auth check error:', error);
        toast.error('Authentication check failed. Please log in again.');
        navigate('/');
      }
    };

    checkAuth();
  }, [navigate]);

  // Fetch data with automatic leave integration - UPDATED TO USE NEW VIEWS
  const fetchData = useCallback(async () => {
    if (!admin) return;

    setIsLoading(true);
    try {
      // Fetch employees
      const { data: fetchedEmployees, error: empError } = await supabase
        .from('employees')
        .select('*')
        .order('employee_name');

      if (empError) {
        console.error('Employee fetch error:', empError);
        toast.error('Failed to fetch employees');
        setIsLoading(false);
        return;
      }
      setEmployees(fetchedEmployees || []);

      // Fetch attendance records
      const { data: fetchedAttendance, error: attError } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('attendance_date', date);

      if (attError) {
        console.error('Attendance fetch error:', attError);
        toast.error('Failed to fetch attendance records');
      }

      // UPDATED: Fetch current active leaves using our new view
      const { data: fetchedLeaves, error: leaveError } = await supabase
        .from('current_active_leaves')
        .select('*');

      if (leaveError) {
        console.error('Leave fetch error:', leaveError);
        setLeaveRecords([]);
      } else {
        setLeaveRecords(fetchedLeaves || []);
      }

      // Merge attendance data with automatic leave status
      const mergedAttendance = (fetchedEmployees || []).map(emp => {
        // Check if employee is on leave for current date
        const employeeLeave = (fetchedLeaves || []).find(leave =>
          leave.employee_id === emp.employee_id &&
          isDateInLeavePeriod(date, leave)
        );

        const existingRecord = (fetchedAttendance || []).find(r =>
          r.employee_id === emp.employee_id
        );

        if (employeeLeave) {
          // --- START OF FIX ---
          let leaveStatus;
          let times;

          // Correctly handle different leave durations when fetching data
          switch (employeeLeave.duration) {
            case 'half_day_morning':
              leaveStatus = 'half_day_morning';
              times = getDefaultTimes('half_day_morning');
              break;
            case 'half_day_afternoon':
              leaveStatus = 'half_day_afternoon';
              times = getDefaultTimes('half_day_afternoon');
              break;
            case 'full_day':
            default:
              leaveStatus = 'on_leave';
              times = { checkIn: null, checkOut: null };
              break;
          }

          return {
            employee_id: emp.employee_id,
            status: leaveStatus,
            check_in_time: times.checkIn,
            check_out_time: times.checkOut,
            notes: employeeLeave.leave_reason || 'On leave',
            attendance_date: date,
            is_on_leave: true,
            leave_info: employeeLeave
          };
        }

        // Not on leave - use existing record or default
        return existingRecord || {
          employee_id: emp.employee_id,
          status: 'present',
          check_in_time: DEFAULT_CHECK_IN,
          check_out_time: DEFAULT_CHECK_OUT,
          notes: '',
          attendance_date: date,
          is_on_leave: false
        };
      });

      setAttendance(mergedAttendance);

    } catch (error) {
      console.error('Fetch data error:', error);
      toast.error('Failed to fetch data from the server.');
    } finally {
      setIsLoading(false);
    }
  }, [admin, date]);

  useEffect(() => {
    if (admin) {
      fetchData();
    }
  }, [admin, fetchData]);

  // Handle attendance changes with leave protection
  const handleAttendanceChange = (employee_id, field, value) => {
    setAttendance(attendance.map(record => {
      if (record.employee_id === employee_id) {
        // Don't allow changes if employee is on leave
        if (record.is_on_leave && field !== 'notes') {
          toast.warning('Cannot modify attendance for employees on leave');
          return record;
        }

        const newRecord = { ...record, [field]: value };

        // When status changes, update default times automatically
        if (field === 'status') {
          const defaultTimes = getDefaultTimes(value);
          newRecord.check_in_time = defaultTimes.checkIn;
          newRecord.check_out_time = defaultTimes.checkOut;
        }

        // Format time fields properly for database
        if (field === 'check_in_time' || field === 'check_out_time') {
          newRecord[field] = formatTimeForDB(value);
        }

        return newRecord;
      }
      return record;
    }));
  };

  // Bulk attendance update
  const applyBulkStatus = () => {
    if (!bulkStatus) {
      toast.error('Please select a status to apply');
      return;
    }

    setAttendance(attendance.map(record => {
      if (record.is_on_leave) return record; // Skip employees on leave

      const defaultTimes = getDefaultTimes(bulkStatus);
      return {
        ...record,
        status: bulkStatus,
        check_in_time: defaultTimes.checkIn,
        check_out_time: defaultTimes.checkOut
      };
    }));

    toast.success(`All employees marked as ${bulkStatus}`);
    setBulkStatus('');
  };

  // Save attendance
  const saveAttendance = async () => {
    try {
      const recordsToSave = attendance.filter(record => !record.is_on_leave);

      if (recordsToSave.length === 0) {
        toast.info('No attendance records to save');
        return;
      }

      const { error } = await supabase
        .from('attendance_records')
        .upsert(
          recordsToSave.map(record => ({
            employee_id: record.employee_id,
            attendance_date: record.attendance_date,
            status: record.status,
            check_in_time: record.status === 'absent' ? null : formatTimeForDB(record.check_in_time),
            check_out_time: record.status === 'absent' ? null : formatTimeForDB(record.check_out_time),
            notes: record.notes || null
          })),
          { onConflict: 'employee_id,attendance_date' }
        );

      if (error) {
        console.error('Save attendance error:', error);
        toast.error('Failed to save attendance: ' + error.message);
      } else {
        toast.success('Attendance saved successfully!');
      }
    } catch (error) {
      console.error('Save attendance error:', error);
      toast.error('Failed to save attendance.');
    }
  };

  // Add employee function
  const addEmployee = async () => {
    if (!newEmployee.name.trim()) {
      toast.error('Employee name cannot be empty.');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('employees')
        .insert([
          {
            employee_name: newEmployee.name.trim(),
            designation: newEmployee.designation.trim() || 'NA'
          }
        ])
        .select()
        .single();

      if (error) {
        console.error('Add employee error:', error);
        toast.error('Failed to add employee: ' + error.message);
        return;
      }

      // Add to local state
      setEmployees([...employees, data]);
      setAttendance([...attendance, {
        employee_id: data.employee_id,
        status: 'present',
        check_in_time: DEFAULT_CHECK_IN,
        check_out_time: DEFAULT_CHECK_OUT,
        notes: '',
        attendance_date: date,
        is_on_leave: false
      }]);

      setShowModal(false);
      setNewEmployee({ name: '', designation: '' });
      toast.success('Employee added successfully!');

    } catch (error) {
      console.error('Add employee error:', error);
      toast.error('Failed to add employee.');
    }
  };

  // Delete employee
  const deleteEmployee = async () => {
    if (!employeeToDelete) return;

    try {
      // First delete all related records
      await supabase.from('attendance_records').delete().eq('employee_id', employeeToDelete.employee_id);
      await supabase.from('leave_records').delete().eq('employee_id', employeeToDelete.employee_id);

      // Then delete the employee
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('employee_id', employeeToDelete.employee_id);

      if (error) {
        console.error('Delete employee error:', error);
        toast.error('Failed to delete employee: ' + error.message);
      } else {
        toast.success('Employee deleted successfully!');
        setShowDeleteConfirm(false);
        setEmployeeToDelete(null);
        fetchData();
      }
    } catch (error) {
      console.error('Delete employee error:', error);
      toast.error('Failed to delete employee.');
    }
  };

  // Add leave record with explicit 'full_day' handling - FIXED VERSION
  const addLeave = async () => {
    // Validation for all required fields
    if (!newLeave.employee_id) {
      toast.error('Please select an employee.');
      return;
    }
    if (!newLeave.leave_type) {
      toast.error('Please select a leave type.');
      return;
    }
    if (!newLeave.duration) {
      toast.error('Please select a duration.');
      return;
    }
    if (!newLeave.leave_reason.trim()) {
      toast.error('Please enter a leave reason.');
      return;
    }
  
    if (new Date(newLeave.start_date) > new Date(newLeave.end_date)) {
      toast.error('End date cannot be before start date.');
      return;
    }
  
    try {
      // Check for existing leave overlap
      const { data: existingLeaves, error: checkError } = await supabase
        .from('leave_records')
        .select('*')
        .eq('employee_id', parseInt(newLeave.employee_id))
        .eq('status', 'active');
    
      if (checkError) {
        console.error('Check existing leaves error:', checkError);
        toast.error('Failed to check existing leaves');
        return;
      }
    
      const hasOverlap = (existingLeaves || []).some(leave => {
        const existingStart = new Date(leave.start_date || leave.leave_date);
        const existingEnd = new Date(leave.end_date || leave.leave_date);
        const newStart = new Date(newLeave.start_date);
        const newEnd = new Date(newLeave.end_date);
        return (newStart <= existingEnd && newEnd >= existingStart);
      });
    
      if (hasOverlap) {
        toast.error('This employee already has active leave during this period.');
        return;
      }
    
      // Insert leave record
      const { error } = await supabase
        .from('leave_records')
        .insert([
          {
            employee_id: parseInt(newLeave.employee_id),
            leave_date: newLeave.start_date,
            start_date: newLeave.start_date,
            end_date: newLeave.end_date,
            leave_reason: newLeave.leave_reason.trim(),
            leave_type: newLeave.leave_type,
            duration: newLeave.duration,
            total_days: calculateDateDifference(newLeave.start_date, newLeave.end_date),
            status: 'active'
          }
        ]);
      
      if (error) {
        console.error('Add leave error:', error);
        toast.error('Failed to add leave record: ' + error.message);
        return;
      }
    
      // Auto-create attendance records for leave period
      const startDate = new Date(newLeave.start_date);
      const endDate = new Date(newLeave.end_date);
      const attendanceRecords = [];
    
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const currentDate = d.toISOString().split('T')[0];
        let status;
        let checkInTime = null;
        let checkOutTime = null;
        
        // Handle different leave durations with proper NULL values for full day leave
        switch (newLeave.duration) {
          case 'half_day_morning':
            status = 'half_day_morning';
            checkInTime = '10:30:00';  // Will be converted to TIME type
            checkOutTime = '14:30:00';
            break;
          case 'half_day_afternoon':
            status = 'half_day_afternoon';
            checkInTime = '14:30:00';
            checkOutTime = '18:30:00';
            break;
          case 'full_day':
            status = 'on_leave';
            checkInTime = null;  // NULL for full day leave
            checkOutTime = null; // NULL for full day leave
            break;
          default:
            status = 'on_leave';
            checkInTime = null;
            checkOutTime = null;
            break;
        }
      
        attendanceRecords.push({
          employee_id: parseInt(newLeave.employee_id),
          attendance_date: currentDate,
          status: status,
          check_in_time: checkInTime,   // Either NULL or valid time string
          check_out_time: checkOutTime, // Either NULL or valid time string
          notes: `On leave: ${newLeave.leave_reason}`
        });
      }
    
      // Insert attendance records
      if (attendanceRecords.length > 0) {
        const { error: attError } = await supabase
          .from('attendance_records')
          .upsert(attendanceRecords, {
            onConflict: 'employee_id,attendance_date'
          });
        
        if (attError) {
          console.error('Auto-create attendance error:', attError);
          const errorMessage = attError.message || 'Failed to auto-create attendance records';
          toast.warning(`Leave added but failed to create attendance: ${errorMessage}`);
        }
      }
    
      setShowLeaveModal(false);
      setNewLeave({
        employee_id: '',
        leave_reason: '',
        leave_type: 'sick',
        duration: 'full_day',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0]
      });
      toast.success('Leave record added successfully!');
      fetchData();
    
    } catch (error) {
      console.error('Add leave error:', error);
      toast.error('Failed to add leave record.');
    }
  };
  

  // Delete leave record
  const deleteLeave = async (leaveId) => {
    try {
      // Update status to completed instead of deleting
      const { error } = await supabase
        .from('leave_records')
        .update({ status: 'completed' })
        .eq('leave_id', leaveId);

      if (error) {
        console.error('Delete leave error:', error);
        toast.error('Failed to delete leave record');
      } else {
        toast.success('Leave record deleted successfully');
        fetchData();
      }
    } catch (error) {
      console.error('Delete leave error:', error);
      toast.error('Failed to delete leave record');
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error('Logout failed: ' + error.message);
      } else {
        setAdmin(null);
        toast.success('Logged out successfully');
        navigate('/');
      }
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Logout failed.');
    }
  };

  if (isLoading || !admin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const stats = getAttendanceStats();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Employee Attendance Dashboard</h1>
              <p className="text-gray-600">Welcome, {admin.adminEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Date Navigation */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => changeDate(-1)}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                ← Previous
              </button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={() => changeDate(1)}
                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
              >
                Next →
              </button>
              <button
                onClick={goToToday}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Today
              </button>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={exportToCSV}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
              >
                Export CSV
              </button>
              <button
                onClick={saveAttendance}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-6">
          <div className="bg-green-100 p-4 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-800">{stats.present}</div>
            <div className="text-sm text-green-600">Present</div>
          </div>
          <div className="bg-red-100 p-4 rounded-lg border border-red-200">
            <div className="text-2xl font-bold text-red-800">{stats.absent}</div>
            <div className="text-sm text-red-600">Absent</div>
          </div>
          <div className="bg-yellow-100 p-4 rounded-lg border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-800">{stats.halfDayMorning}</div>
            <div className="text-sm text-yellow-600">Half Day (AM)</div>
          </div>
          <div className="bg-orange-100 p-4 rounded-lg border border-orange-200">
            <div className="text-2xl font-bold text-orange-800">{stats.halfDayAfternoon}</div>
            <div className="text-sm text-orange-600">Half Day (PM)</div>
          </div>
          <div className="bg-blue-100 p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-800">{stats.onLeave}</div>
            <div className="text-sm text-blue-600">On Leave</div>
          </div>
          <div className="bg-purple-100 p-4 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-800">{stats.late}</div>
            <div className="text-sm text-purple-600">Late Arrival</div>
          </div>
          <div className="bg-pink-100 p-4 rounded-lg border border-pink-200">
            <div className="text-2xl font-bold text-pink-800">{stats.early}</div>
            <div className="text-sm text-pink-600">Early Departure</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
            >
              Add Employee
            </button>
            <button
              onClick={() => setShowLeaveModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
            >
              Add Leave Record
            </button>
            <div className="flex items-center space-x-2">
              <select
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select Bulk Status</option>
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="half_day_morning">Half Day (Morning)</option>
                <option value="half_day_afternoon">Half Day (Afternoon)</option>
              </select>
              <button
                onClick={applyBulkStatus}
                disabled={!bulkStatus}
                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-gray-400 transition-colors"
              >
                Apply to All
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Table */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Attendance for {date}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-In</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Check-Out</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {employees.length > 0 ? employees.map((emp) => {
                  const attRecord = attendance.find(att => att.employee_id === emp.employee_id);
                  const isOnLeave = attRecord?.is_on_leave || false;
                  const isLate = isLateArrival(attRecord?.check_in_time, attRecord?.status);
                  const isEarly = isEarlyDeparture(attRecord?.check_out_time, attRecord?.status);

                  return (
                    <tr key={emp.employee_id} className={isOnLeave ? 'bg-blue-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{emp.employee_name}</div>
                          <div className="text-sm text-gray-500">{emp.designation}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={attRecord?.status || 'present'}
                          onChange={(e) => handleAttendanceChange(emp.employee_id, 'status', e.target.value)}
                          disabled={isOnLeave}
                          className={`px-3 py-1 border rounded text-sm ${
                            isOnLeave ? 'bg-gray-100 text-gray-500' : 'border-gray-300 focus:ring-2 focus:ring-blue-500'
                          }`}
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="half_day_morning">Half Day (Morning)</option>
                          <option value="half_day_afternoon">Half Day (Afternoon)</option>
                          <option value="on_leave">On Leave</option>
                        </select>
                        {isOnLeave && (
                          <div className="text-xs text-blue-600 mt-1">On Leave</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="time"
                          value={formatTimeForDisplay(attRecord?.check_in_time) || ''}
                          onChange={(e) => handleAttendanceChange(emp.employee_id, 'check_in_time', e.target.value)}
                          disabled={isOnLeave || attRecord?.status === 'absent'}
                          className={`px-2 py-1 border rounded text-sm ${
                            isOnLeave || attRecord?.status === 'absent' 
                              ? 'bg-gray-100 text-gray-500' 
                              : `border-gray-300 focus:ring-2 focus:ring-blue-500 ${isLate ? 'border-red-300 bg-red-50' : ''}`
                          }`}
                        />
                        {isLate && <div className="text-xs text-red-600">Late</div>}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="time"
                          value={formatTimeForDisplay(attRecord?.check_out_time) || ''}
                          onChange={(e) => handleAttendanceChange(emp.employee_id, 'check_out_time', e.target.value)}
                          disabled={isOnLeave || attRecord?.status === 'absent'}
                          className={`px-2 py-1 border rounded text-sm ${
                            isOnLeave || attRecord?.status === 'absent'
                              ? 'bg-gray-100 text-gray-500'
                              : `border-gray-300 focus:ring-2 focus:ring-blue-500 ${isEarly ? 'border-red-300 bg-red-50' : ''}`
                          }`}
                        />
                        {isEarly && <div className="text-xs text-red-600">Early</div>}
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={attRecord?.notes || ''}
                          onChange={(e) => handleAttendanceChange(emp.employee_id, 'notes', e.target.value)}
                          readOnly={isOnLeave}
                          className={`px-2 py-1 border rounded text-sm w-full ${
                            isOnLeave ? 'bg-gray-100 text-gray-500' : 'border-gray-300 focus:ring-2 focus:ring-blue-500'
                          }`}
                          placeholder="Notes"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => {
                            setEmployeeToDelete(emp);
                            setShowDeleteConfirm(true);
                          }}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                      No employees found. Please add an employee to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Leave Records */}
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Current Active Leave Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leave Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaveRecords.length > 0 ? leaveRecords.map((leave) => (
                  <tr key={leave.leave_id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{leave.employee_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                        {leave.leave_type?.replace('_', ' ') || 'sick leave'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.duration?.replace('_', ' ') || 'full day'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.start_date || leave.leave_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.end_date || leave.leave_date}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {leave.total_days || 1}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {leave.leave_reason}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => deleteLeave(leave.leave_id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="8" className="px-6 py-4 text-center text-gray-500">
                      No active leave records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Employee</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter employee name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={newEmployee.designation}
                    onChange={(e) => setNewEmployee({ ...newEmployee, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter designation"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowModal(false);
                    setNewEmployee({ name: '', designation: '' });
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addEmployee}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Add Employee
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Leave Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add Leave Record</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
                  <select
                    value={newLeave.employee_id}
                    onChange={(e) => setNewLeave({ ...newLeave, employee_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select employee</option>
                    {employees.map((emp) => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.employee_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                  <select
                    value={newLeave.leave_type}
                    onChange={(e) => setNewLeave({ ...newLeave, leave_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a type...</option>
                    <option value="sick">Sick</option>
                    <option value="casual">Casual</option>
                    <option value="emergency">Emergency</option>
                    <option value="personal">Personal</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                  <select
                    value={newLeave.duration}
                    onChange={(e) => setNewLeave({ ...newLeave, duration: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select a duration...</option>
                    <option value="full_day">Full Day</option>
                    <option value="half_day_morning">Half Day (Morning)</option>
                    <option value="half_day_afternoon">Half Day (Afternoon)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                    <input
                      type="date"
                      value={newLeave.start_date}
                      onChange={(e) => setNewLeave({ ...newLeave, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                    <input
                      type="date"
                      value={newLeave.end_date}
                      onChange={(e) => setNewLeave({ ...newLeave, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                  <textarea
                    value={newLeave.leave_reason}
                    onChange={(e) => setNewLeave({ ...newLeave, leave_reason: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter leave reason"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowLeaveModal(false);
                    setNewLeave({
                      employee_id: '',
                      leave_reason: '',
                      leave_type: 'sick',
                      duration: 'full_day',
                      start_date: new Date().toISOString().split('T')[0],
                      end_date: new Date().toISOString().split('T')[0]
                    });
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addLeave}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                >
                  Add Leave
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Employee Confirmation Modal */}
      {showDeleteConfirm && employeeToDelete && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Confirm Delete</h3>
              <p className="mb-4">
                Are you sure you want to delete employee{' '}
                <strong>{employeeToDelete.employee_name}</strong>?
              </p>
              <p className="text-sm text-red-600 mb-6">
                This will also delete all attendance and leave records for this employee.
              </p>
              <div className="flex justify-center space-x-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setEmployeeToDelete(null);
                  }}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteEmployee}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
