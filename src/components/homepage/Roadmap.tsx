import React, { useState, useRef, useEffect } from 'react';
import styles from './Roadmap.module.css';
import {
  getHardcodedProjectData,
  RoadmapItem,
  PROJECT_MAP,
} from '../../services/github';
import {
  CiCircleCheck,
  CiClock1,
  CiCalendar,
  CiPause1,
  CiCircleMore,
} from 'react-icons/ci';

const Roadmap: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [quarterGroups, setQuarterGroups] = useState<Map<string, RoadmapItem[]>>(
    new Map()
  );
  const [availableQuarters, setAvailableQuarters] = useState<string[]>([]);
  const [statusColors, setStatusColors] = useState<Map<string, string>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper function to get quarter from date
  const getQuarterFromDate = (dateString: string | null | undefined): string | null => {
    if (!dateString) return null;
    const date = new Date(dateString);
    const month = date.getMonth();
    const year = date.getFullYear();
    const quarter = Math.floor(month / 3) + 1;
    return `Q${quarter} ${year}`;
  };

  // Helper function to determine item's quarter
  const getItemQuarter = (item: RoadmapItem): string => {
    // Try to get quarter from various sources
    if (item.quarter) return item.quarter;
    
    // Try start date
    if (item.startDate) {
      const quarter = getQuarterFromDate(item.startDate);
      if (quarter) return quarter;
    }
    
    // Try end date
    if (item.endDate || item.dueDate) {
      const quarter = getQuarterFromDate(item.endDate || item.dueDate);
      if (quarter) return quarter;
    }
    
    // Try closed date for completed items
    if (item.closedAt && item.status.toLowerCase().includes('done')) {
      const quarter = getQuarterFromDate(item.closedAt);
      if (quarter) return quarter;
    }
    
    // Default to current quarter
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(currentMonth / 3) + 1;
    return `Q${currentQuarter} ${currentYear}`;
  };

  // Get default quarters (current and next 3)
  const getDefaultQuarters = (): string[] => {
    const quarters: string[] = [];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(currentMonth / 3) + 1;
    
    for (let i = 0; i < 4; i++) {
      const q = ((currentQuarter - 1 + i) % 4) + 1;
      const y = currentYear + Math.floor((currentQuarter - 1 + i) / 4);
      quarters.push(`Q${q} ${y}`);
    }
    
    return quarters;
  };

  // Use hardcoded data on component mount
  useEffect(() => {
    const loadRoadmapData = () => {
      try {
        setIsLoading(true);
        const projectData = getHardcodedProjectData();

        // This will throw if data is invalid, which is what we want
        if (projectData.error) {
          setError(projectData.error);
        } else {
          // Add quarter information to items
          const itemsWithQuarters = projectData.items.map(item => ({
            ...item,
            quarter: getItemQuarter(item),
          }));
          
          setRoadmapItems(itemsWithQuarters);
          setStatusColors(projectData.statuses);

          // Get quarters from data or use defaults
          const quarters = projectData.quarters && projectData.quarters.length > 0
            ? projectData.quarters
            : getDefaultQuarters();
          
          setAvailableQuarters(quarters);

          // Define status priority for sorting
          const statusPriority: Record<string, number> = {
            'done': 1,
            'complete': 1,
            'closed': 1,
            'this sprint': 2,
            'current': 2,
            'in progress': 2,
            'next sprint/on deck': 3,
            'next': 3,
            'on deck': 3,
            'upcoming': 3,
            'paused/blocked': 4,
            'paused': 4,
            'blocked': 4,
            'todo': 5,
            'backlog': 5,
          };

          // Helper function to get status priority
          const getStatusPriority = (status: string): number => {
            const statusLower = status.toLowerCase();
            for (const [key, priority] of Object.entries(statusPriority)) {
              if (statusLower.includes(key)) {
                return priority;
              }
            }
            return 99; // Default priority for unknown statuses
          };

          // Group items by quarter
          const groups = new Map<string, RoadmapItem[]>();
          
          // Initialize all quarters with empty arrays
          quarters.forEach((quarter) => {
            groups.set(quarter, []);
          });
          
          // Add items to their respective quarters
          itemsWithQuarters.forEach((item) => {
            const itemQuarter = item.quarter || getItemQuarter(item);
            const existing = groups.get(itemQuarter) || [];
            groups.set(itemQuarter, [...existing, item]);
          });
          
          // Sort items within each quarter by status priority
          groups.forEach((items, quarter) => {
            const sortedItems = items.sort((a, b) => {
              const priorityA = getStatusPriority(a.status);
              const priorityB = getStatusPriority(b.status);
              return priorityA - priorityB;
            });
            groups.set(quarter, sortedItems);
          });
          
          setQuarterGroups(groups);
        }
      } catch (err) {
        console.error('Failed to load roadmap data:', err);
        setError('Failed to load roadmap data');
      } finally {
        setIsLoading(false);
      }
    };

    loadRoadmapData();
  }, []);

  // Get appropriate icon for status
  const getStatusIcon = (status: string, color: string) => {
    const statusLower = status.toLowerCase();
    const iconProps = { size: 16, color: color, style: { strokeWidth: 1.5 } };

    // Done/Complete statuses - check circle icon
    if (
      statusLower.includes('done') ||
      statusLower.includes('complete') ||
      statusLower.includes('closed')
    ) {
      return <CiCircleCheck {...iconProps} />;
    }

    // In Progress/Current statuses - clock icon
    if (
      statusLower.includes('this sprint') ||
      statusLower.includes('current') ||
      statusLower.includes('in progress')
    ) {
      return <CiClock1 {...iconProps} />;
    }

    // Next/Upcoming statuses - calendar icon
    if (
      statusLower.includes('next') ||
      statusLower.includes('on deck') ||
      statusLower.includes('upcoming')
    ) {
      return <CiCalendar {...iconProps} />;
    }

    // Paused/Blocked statuses - pause icon
    if (statusLower.includes('paused') || statusLower.includes('blocked')) {
      return <CiPause1 {...iconProps} />;
    }

    // Todo/Backlog statuses (default) - circle icon
    return <CiCircleMore {...iconProps} />;
  };

  // Check if quarter is current
  const isCurrentQuarter = (quarter: string): boolean => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentQ = Math.floor(currentMonth / 3) + 1;
    const currentQuarter = `Q${currentQ} ${currentYear}`;
    return quarter === currentQuarter;
  };

  const handlePrevious = () => {
    if (containerRef.current) {
      containerRef.current.scrollBy({
        left: -300,
        behavior: 'smooth',
      });
    }
  };

  const handleNext = () => {
    if (containerRef.current) {
      containerRef.current.scrollBy({
        left: 300,
        behavior: 'smooth',
      });
    }
  };

  if (isLoading) {
    return (
      <section className={styles.roadmapSection}>
        <div className={styles.headerContainer}>
          <div className={styles.titleContainer}>
            <h2 className={styles.title}>Roadmap</h2>
          </div>
          <div className={styles.divider} />
        </div>
        <div className={styles.roadmapContent}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            Loading roadmap data...
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.roadmapSection}>
        <div className={styles.headerContainer}>
          <div className={styles.titleContainer}>
            <h2 className={styles.title}>Roadmap</h2>
          </div>
          <div className={styles.divider} />
        </div>
        <div className={styles.roadmapContent}>
          <div
            style={{ textAlign: 'center', padding: '40px', color: '#ff6b6b' }}
          >
            Failed to load roadmap data. Please try again later.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.roadmapSection}>
      <div className={styles.headerContainer}>
        <div className={styles.titleContainer}>
          <h2 className={styles.title}>Roadmap</h2>
          <div className={styles.navigationControls}>
            <button
              className={styles.navButton}
              aria-label="Previous"
              onClick={handlePrevious}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M20 24L12 16L20 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className={styles.navButton}
              aria-label="Next"
              onClick={handleNext}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 24L20 16L12 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.divider} />
      </div>

      <div className={styles.roadmapContent}>
        <div className={styles.timelineContainer} ref={containerRef}>
          {availableQuarters.map((quarter, quarterIndex) => {
            const items = quarterGroups.get(quarter) || [];
            const isCurrent = isCurrentQuarter(quarter);

            return (
              <div key={quarter} className={styles.statusColumn}>
                <div className={styles.statusHeader}>
                  <div className={styles.timelineLine} />
                  <div
                    className={`${styles.timelineDot} ${isCurrent ? styles.current : ''}`}
                  />
                  <div className={styles.timelineLine} />
                </div>
                <h3 className={styles.statusLabel}>{quarter}</h3>
                <div className={styles.cardsContainer}>
                  {items.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No items</span>
                    </div>
                  ) : (
                    items.map((item) => {
                      const projectConfig = PROJECT_MAP[item.projectNumber || 1];
                      return (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.roadmapCard}
                          style={{ textDecoration: 'none' }}
                        >
                          <div className={styles.cardContent}>
                            <div className={styles.categoryBadge}>
                              {projectConfig?.icon && (
                                <img
                                  src={projectConfig.icon}
                                  alt="Project icon"
                                  width="14"
                                  height="14"
                                />
                              )}
                              <span
                                className={`${styles.categoryText} ${styles[item.category]}`}
                              >
                                {projectConfig?.name?.toUpperCase() || 
                                 (item.category === 'governance'
                                  ? 'GOVERNANCE & PRODUCT'
                                  : 'AI & RESEARCH')}
                              </span>
                            </div>
                            <h4 className={styles.cardTitle}>{item.title}</h4>
                            <span className={styles.issueNumber}>
                              #{item.issueNumber}
                            </span>
                          </div>
                          <div
                            className={styles.statusBadge}
                            style={{ backgroundColor: item.statusColor }}
                          >
                            {getStatusIcon(item.status, item.statusTextColor)}
                            <span style={{ color: item.statusTextColor }}>
                              {item.status}
                            </span>
                          </div>
                        </a>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Roadmap;