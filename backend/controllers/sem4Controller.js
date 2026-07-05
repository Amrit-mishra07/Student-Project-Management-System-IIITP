const SystemConfig = require('../models/SystemConfig');
const Student = require('../models/Student');

const getCurrentAcademicYear = () => {
  const now = new Date();
  const month = now.getMonth(); // 0 = January, 6 = July
  const year = now.getFullYear();
  if (month >= 6) {
    return `${year}-${(year + 1).toString().slice(-2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(-2)}`;
  }
};

exports.setSem4Choice = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chosenTrack } = req.body;

    if (!['internship', 'coursework'].includes(chosenTrack)) {
      return res.status(400).json({ success: false, message: 'Invalid chosenTrack' });
    }

    const student = await Student.findOne({ user: userId });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (student.degree !== 'M.Tech' || student.semester !== 4) {
      return res.status(400).json({
        success: false,
        message: 'Sem 4 choice allowed only for M.Tech Semester 4 students'
      });
    }

    const academicYear = await getCurrentAcademicYear();
    await student.setSemesterSelection(4, academicYear, chosenTrack);

    const selection = student.getSemesterSelection(4);
    return res.json({ success: true, data: selection });
  } catch (error) {
    console.error('setSem4Choice error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getSem4Choice = async (req, res) => {
  try {
    const userId = req.user.userId;
    const student = await Student.findOne({ user: userId });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (student.degree !== 'M.Tech' || student.semester < 4) {
      return res.status(400).json({
        success: false,
        message: 'Sem 4 choice available only for M.Tech Semester 4 or above'
      });
    }

    const selection = student.getSemesterSelection(4) || null;
    return res.json({ success: true, data: selection });
  } catch (error) {
    console.error('getSem4Choice error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.listSem4TrackChoices = async (req, res) => {
  try {
    const { status, track, academicYear } = req.query;
    const academicYearFilter = academicYear || await getCurrentAcademicYear();

    const query = {
      degree: 'M.Tech',
      semester: 4,
      'semesterSelections.semester': 4,
      'semesterSelections.academicYear': academicYearFilter
    };

    const students = await Student.find(query)
      .populate('user', 'email')
      .select('fullName misNumber contactNumber branch collegeEmail semesterSelections user')
      .lean();

    let trackChoices = students.map(student => {
      const selection = student.semesterSelections.find(s => s.semester === 4);
      return {
        ...student,
        selection: selection ? { ...selection } : null
      };
    });

    trackChoices = trackChoices.filter(choice => choice.selection !== null);

    if (status) {
      trackChoices = trackChoices.filter(choice => choice.selection?.verificationStatus === status);
    }

    if (track) {
      trackChoices = trackChoices.filter(
        choice => choice.selection?.chosenTrack === track || choice.selection?.finalizedTrack === track
      );
    }

    trackChoices.sort((a, b) => {
      const keyA = (a.collegeEmail || a.misNumber || '').toLowerCase();
      const keyB = (b.collegeEmail || b.misNumber || '').toLowerCase();
      return keyA.localeCompare(keyB);
    });

    return res.json({
      success: true,
      data: trackChoices,
      total: trackChoices.length
    });
  } catch (error) {
    console.error('listSem4TrackChoices error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
};

exports.finalizeSem4Track = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { finalizedTrack } = req.body;

    if (!['internship', 'coursework'].includes(finalizedTrack)) {
      return res.status(400).json({
        success: false,
        message: "finalizedTrack must be 'internship' or 'coursework'"
      });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (student.degree !== 'M.Tech' || student.semester !== 4) {
      return res.status(400).json({
        success: false,
        message: 'This endpoint is only for M.Tech Semester 4 students'
      });
    }

    const selectionIndex = student.semesterSelections.findIndex(
      s => s.semester === 4
    );
    if (selectionIndex === -1) {
      return res.status(400).json({
        success: false,
        message: 'Student has not made a track choice yet'
      });
    }

    student.semesterSelections[selectionIndex].finalizedTrack = finalizedTrack;
    student.semesterSelections[selectionIndex].verificationStatus = 'approved';
    student.semesterSelections[selectionIndex].updatedAt = new Date();
    await student.save();

    return res.json({
      success: true,
      message: `Track finalized to '${finalizedTrack}' for student`,
      data: student.semesterSelections[selectionIndex]
    });
  } catch (error) {
    console.error('finalizeSem4Track error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error finalizing track',
      error: error.message
    });
  }
};

